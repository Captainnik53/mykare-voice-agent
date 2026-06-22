import json
from datetime import datetime, timedelta

from pipecat.adapters.schemas.function_schema import FunctionSchema
from pipecat.adapters.schemas.tools_schema import ToolsSchema
from pipecat.services.llm_service import FunctionCallParams

import database as db


SLOT_TIMES = ["09:00 AM", "10:30 AM", "12:00 PM", "01:30 PM", "03:00 PM", "04:30 PM"]
DOCTORS = ["Dr. Sharma", "Dr. Patel", "Dr. Nair"]


def _available_slots(date_filter: str | None = None) -> list[dict]:
    today = datetime.now()
    slots = []
    for offset in range(1, 8):
        day = today + timedelta(days=offset)
        if day.weekday() == 6:  # skip Sunday
            continue
        date_str = day.strftime("%Y-%m-%d")
        date_display = day.strftime("%A, %B %-d")
        for t in SLOT_TIMES:
            slots.append({"date": date_str, "date_display": date_display, "time": t})
    if date_filter:
        slots = [s for s in slots if s["date"] == date_filter]
    return slots[:18]


# ---------------------------------------------------------------------------
# Tool schemas
# ---------------------------------------------------------------------------

_SCHEMAS = [
    FunctionSchema(
        name="identify_user",
        description="Identify the caller by their phone number. Call this as soon as the user provides their phone number.",
        properties={
            "phone": {"type": "string", "description": "Caller's phone number, e.g. '9876543210'"},
            "name": {"type": "string", "description": "Caller's name if already mentioned"},
        },
        required=["phone"],
    ),
    FunctionSchema(
        name="fetch_slots",
        description="Fetch available appointment slots. Call when the patient asks about availability.",
        properties={
            "date": {"type": "string", "description": "Optional date filter in YYYY-MM-DD format"},
        },
        required=[],
    ),
    FunctionSchema(
        name="book_appointment",
        description="Book an appointment after confirming phone, name, date and time with the patient.",
        properties={
            "phone": {"type": "string", "description": "Patient phone number"},
            "name": {"type": "string", "description": "Patient full name"},
            "date": {"type": "string", "description": "Date in YYYY-MM-DD format"},
            "time_slot": {"type": "string", "description": "Time slot e.g. '10:30 AM'"},
            "doctor": {"type": "string", "description": "Doctor name, default Dr. Sharma"},
        },
        required=["phone", "name", "date", "time_slot"],
    ),
    FunctionSchema(
        name="retrieve_appointments",
        description="Retrieve all active appointments for the patient by phone number.",
        properties={
            "phone": {"type": "string", "description": "Patient phone number"},
        },
        required=["phone"],
    ),
    FunctionSchema(
        name="cancel_appointment",
        description="Cancel an appointment by its ID.",
        properties={
            "appointment_id": {"type": "integer", "description": "Appointment ID to cancel"},
            "phone": {"type": "string", "description": "Patient phone number for verification"},
        },
        required=["appointment_id", "phone"],
    ),
    FunctionSchema(
        name="modify_appointment",
        description="Reschedule an existing appointment to a new date and time.",
        properties={
            "appointment_id": {"type": "integer", "description": "Appointment ID to modify"},
            "phone": {"type": "string", "description": "Patient phone number for verification"},
            "new_date": {"type": "string", "description": "New date in YYYY-MM-DD format"},
            "new_time": {"type": "string", "description": "New time slot e.g. '02:00 PM'"},
        },
        required=["appointment_id", "phone", "new_date", "new_time"],
    ),
    FunctionSchema(
        name="end_conversation",
        description="End the call and generate a summary. Call when the patient says goodbye or is done.",
        properties={
            "preferences": {"type": "string", "description": "Any patient preferences or notes from the call"},
        },
        required=[],
    ),
]


def get_tools_schema() -> ToolsSchema:
    return ToolsSchema(standard_tools=_SCHEMAS)


# ---------------------------------------------------------------------------
# Tool handlers  (pipecat 1.1.0: single FunctionCallParams argument)
# ---------------------------------------------------------------------------

class AppointmentTools:
    def __init__(self, session_id: str, event_cb):
        self.session_id = session_id
        self._emit = event_cb  # async fn(event_dict)
        self.phone: str | None = None
        self.name: str | None = None

    async def _pub(self, event_type: str, data: dict):
        try:
            await self._emit({"type": event_type, "data": data, "ts": datetime.now().isoformat()})
        except Exception:
            pass

    # ------------------------------------------------------------------
    async def identify_user(self, params: FunctionCallParams):
        phone = params.arguments.get("phone", "")
        name = params.arguments.get("name", "")
        self.phone = phone
        if name:
            self.name = name

        await self._pub("tool_called", {"tool": "identify_user", "status": "Identifying user..."})
        apts = db.get_appointments(phone)
        result = {
            "success": True,
            "phone": phone,
            "name": name or "Patient",
            "returning_patient": len(apts) > 0,
            "existing_appointments": len(apts),
        }
        await self._pub("tool_result", {
            "tool": "identify_user",
            "status": "User identified ✓",
            "returning": result["returning_patient"],
            "name": name or "Patient",
            "phone": phone,
        })
        await params.result_callback(json.dumps(result))

    # ------------------------------------------------------------------
    async def fetch_slots(self, params: FunctionCallParams):
        date = params.arguments.get("date")
        await self._pub("tool_called", {"tool": "fetch_slots", "status": "Fetching available slots..."})
        slots = _available_slots(date)

        grouped: dict[str, list[str]] = {}
        for s in slots:
            grouped.setdefault(s["date_display"], []).append(s["time"])

        result = {"available_slots": grouped, "doctors": DOCTORS, "total": len(slots)}
        await self._pub("tool_result", {"tool": "fetch_slots", "status": f"Found {len(slots)} slots ✓"})
        await params.result_callback(json.dumps(result))

    # ------------------------------------------------------------------
    async def book_appointment(self, params: FunctionCallParams):
        args = params.arguments
        phone = args.get("phone") or self.phone or ""
        name = args.get("name") or self.name or "Patient"
        date = args.get("date", "")
        time_slot = args.get("time_slot", "")
        doctor = args.get("doctor", "Dr. Sharma")

        await self._pub("tool_called", {"tool": "book_appointment", "status": f"Booking for {date} at {time_slot}..."})
        result = db.book_appointment(phone, name, date, time_slot, doctor)

        if result["success"]:
            await self._pub("tool_result", {
                "tool": "book_appointment", "status": "Appointment booked ✅",
                "date": date, "time": time_slot, "doctor": doctor,
            })
        else:
            await self._pub("tool_result", {
                "tool": "book_appointment",
                "status": f"Booking failed ❌ — {result.get('error')}",
            })
        await params.result_callback(json.dumps(result))

    # ------------------------------------------------------------------
    async def retrieve_appointments(self, params: FunctionCallParams):
        phone = params.arguments.get("phone") or self.phone or ""
        await self._pub("tool_called", {"tool": "retrieve_appointments", "status": "Fetching appointments..."})
        apts = db.get_appointments(phone)
        await self._pub("tool_result", {
            "tool": "retrieve_appointments",
            "status": f"Found {len(apts)} appointment(s) ✓",
        })
        await params.result_callback(json.dumps({"appointments": apts}))

    # ------------------------------------------------------------------
    async def cancel_appointment(self, params: FunctionCallParams):
        args = params.arguments
        apt_id = args.get("appointment_id")
        phone = args.get("phone") or self.phone or ""
        await self._pub("tool_called", {"tool": "cancel_appointment", "status": f"Cancelling appointment #{apt_id}..."})
        result = db.cancel_appointment(apt_id, phone)
        status = "Appointment cancelled ✅" if result["success"] else f"Cancellation failed ❌ — {result.get('error')}"
        await self._pub("tool_result", {"tool": "cancel_appointment", "status": status})
        await params.result_callback(json.dumps(result))

    # ------------------------------------------------------------------
    async def modify_appointment(self, params: FunctionCallParams):
        args = params.arguments
        apt_id = args.get("appointment_id")
        phone = args.get("phone") or self.phone or ""
        new_date = args.get("new_date", "")
        new_time = args.get("new_time", "")
        await self._pub("tool_called", {"tool": "modify_appointment", "status": f"Rescheduling to {new_date} at {new_time}..."})
        result = db.modify_appointment(apt_id, phone, new_date, new_time)
        status = "Appointment rescheduled ✅" if result["success"] else f"Reschedule failed ❌ — {result.get('error')}"
        await self._pub("tool_result", {"tool": "modify_appointment", "status": status})
        await params.result_callback(json.dumps(result))

    # ------------------------------------------------------------------
    async def end_conversation(self, params: FunctionCallParams):
        preferences = params.arguments.get("preferences", "")
        phone = self.phone or ""

        await self._pub("tool_called", {"tool": "end_conversation", "status": "Generating call summary..."})

        apts = db.get_appointments(phone) if phone else []

        parts = []
        if self.name or phone:
            parts.append(f"Patient: {self.name or 'Unknown'} | Phone: {phone or 'Not provided'}")
        if apts:
            lines = [f"• {a['date']} at {a['time_slot']} with {a.get('doctor', 'Dr. Sharma')}" for a in apts]
            parts.append("Appointments:\n" + "\n".join(lines))
        else:
            parts.append("No appointments on record.")
        if preferences:
            parts.append(f"Patient notes: {preferences}")

        summary = "\n\n".join(parts)
        if phone:
            db.save_summary(self.session_id, phone, summary, apts, preferences)

        await self._pub("call_ended", {
            "summary": summary,
            "phone": phone,
            "name": self.name or "",
            "appointments": apts,
            "preferences": preferences,
            "timestamp": datetime.now().isoformat(),
        })
        await params.result_callback(json.dumps({"success": True, "message": "Goodbye!"}))

    # ------------------------------------------------------------------
    def handlers(self) -> dict:
        return {
            "identify_user": self.identify_user,
            "fetch_slots": self.fetch_slots,
            "book_appointment": self.book_appointment,
            "retrieve_appointments": self.retrieve_appointments,
            "cancel_appointment": self.cancel_appointment,
            "modify_appointment": self.modify_appointment,
            "end_conversation": self.end_conversation,
        }

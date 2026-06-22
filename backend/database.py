import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "appointments.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            phone TEXT NOT NULL,
            name TEXT,
            date TEXT NOT NULL,
            time_slot TEXT NOT NULL,
            doctor TEXT DEFAULT 'Dr. Sharma',
            notes TEXT,
            status TEXT DEFAULT 'confirmed',
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS call_summaries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT UNIQUE NOT NULL,
            phone TEXT,
            summary TEXT,
            appointments TEXT,
            preferences TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
    """)
    conn.commit()
    conn.close()


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def get_appointments(phone: str) -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM appointments WHERE phone = ? AND status != 'cancelled' ORDER BY date, time_slot",
            (phone,),
        ).fetchall()
    return [dict(r) for r in rows]


def book_appointment(phone: str, name: str, date: str, time_slot: str, doctor: str = "Dr. Sharma") -> dict:
    with _conn() as conn:
        clash = conn.execute(
            "SELECT id FROM appointments WHERE date = ? AND time_slot = ? AND status = 'confirmed'",
            (date, time_slot),
        ).fetchone()
        if clash:
            return {"success": False, "error": "That slot is already booked. Please choose another time."}
        cur = conn.execute(
            "INSERT INTO appointments (phone, name, date, time_slot, doctor) VALUES (?, ?, ?, ?, ?)",
            (phone, name, date, time_slot, doctor),
        )
        conn.commit()
    return {"success": True, "appointment_id": cur.lastrowid, "date": date, "time": time_slot, "doctor": doctor}


def cancel_appointment(appointment_id: int, phone: str) -> dict:
    with _conn() as conn:
        cur = conn.execute(
            "UPDATE appointments SET status = 'cancelled' WHERE id = ? AND phone = ?",
            (appointment_id, phone),
        )
        conn.commit()
    if cur.rowcount:
        return {"success": True, "message": f"Appointment #{appointment_id} cancelled."}
    return {"success": False, "error": "Appointment not found or not authorised."}


def modify_appointment(appointment_id: int, phone: str, new_date: str, new_time: str) -> dict:
    with _conn() as conn:
        clash = conn.execute(
            "SELECT id FROM appointments WHERE date = ? AND time_slot = ? AND status = 'confirmed' AND id != ?",
            (new_date, new_time, appointment_id),
        ).fetchone()
        if clash:
            return {"success": False, "error": "That slot is already taken. Please choose another."}
        cur = conn.execute(
            "UPDATE appointments SET date = ?, time_slot = ? WHERE id = ? AND phone = ?",
            (new_date, new_time, appointment_id, phone),
        )
        conn.commit()
    if cur.rowcount:
        return {"success": True, "appointment_id": appointment_id, "new_date": new_date, "new_time": new_time}
    return {"success": False, "error": "Appointment not found."}


def save_summary(session_id: str, phone: str, summary: str, appointments: list, preferences: str):
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO call_summaries (session_id, phone, summary, appointments, preferences) VALUES (?, ?, ?, ?, ?)",
            (session_id, phone, summary, json.dumps(appointments), preferences),
        )
        conn.commit()


def get_summary(session_id: str) -> dict | None:
    with _conn() as conn:
        row = conn.execute("SELECT * FROM call_summaries WHERE session_id = ?", (session_id,)).fetchone()
    if row:
        d = dict(row)
        d["appointments"] = json.loads(d["appointments"] or "[]")
        return d
    return None

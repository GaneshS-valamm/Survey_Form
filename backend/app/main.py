import csv
import io
import json
import os
from datetime import datetime
from typing import Any, List

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response as FastAPIResponse
from passlib.context import CryptContext
from sqlalchemy import Column, DateTime, ForeignKey, Integer, JSON, String, create_engine
from sqlalchemy.orm import declarative_base, relationship, sessionmaker

CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(CONFIG_PATH, override=False)

ADMIN_USERNAME = os.getenv("ADMIN_USERNAME", "nikil")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin")
PORT = int(os.getenv("PORT", "8000"))
Base = declarative_base()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

engine_cache = {"url": None, "engine": None}


def get_database_url() -> str:
    load_dotenv(CONFIG_PATH, override=False)
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("WARNING: DATABASE_URL not set. Falling back to local SQLite database at ./survey.db.")
        return "sqlite:///./survey.db"
    return db_url


def get_engine():
    db_url = get_database_url()
    if engine_cache["url"] != db_url or engine_cache["engine"] is None:
        engine_cache["engine"] = create_engine(db_url)
        engine_cache["url"] = db_url
    return engine_cache["engine"]


def get_session():
    return sessionmaker(autocommit=False, autoflush=False, bind=get_engine())()


def save_app_config(updates: dict[str, str]):
    existing = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            for line in f:
                if "=" in line and not line.strip().startswith("#"):
                    key, value = line.strip().split("=", 1)
                    existing[key] = value
    existing.update(updates)
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        for key, value in existing.items():
            f.write(f"{key}={value}\n")
    load_dotenv(CONFIG_PATH, override=True)

app = FastAPI(title="Dynamic Survey API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Admin(Base):
    __tablename__ = "admin"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)


class SurveyResponse(Base):
    __tablename__ = "responses"
    id = Column(Integer, primary_key=True, index=True)
    respondent_name = Column(String, nullable=False)
    submitted_at = Column(DateTime, default=datetime.utcnow)
    answers = relationship("Answer", back_populates="response", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"
    id = Column(Integer, primary_key=True, index=True)
    response_id = Column(Integer, ForeignKey("responses.id"), nullable=False)
    question_id = Column(String, nullable=False)
    question_text = Column(String, nullable=False)
    selected_options = Column(JSON, nullable=True)
    typed_answer = Column(String, nullable=True)
    response = relationship("SurveyResponse", back_populates="answers")


Base.metadata.create_all(bind=get_engine())

with get_session() as session:
    admin = session.query(Admin).filter(Admin.username == ADMIN_USERNAME).first()
    if not admin:
        session.add(Admin(username=ADMIN_USERNAME, password_hash=pwd_context.hash(ADMIN_PASSWORD)))
        session.commit()
    elif not pwd_context.verify(ADMIN_PASSWORD, admin.password_hash):
        admin.password_hash = pwd_context.hash(ADMIN_PASSWORD)
        session.commit()


SURVEY_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "survey.json")


def load_survey_json() -> dict[str, Any]:
    with open(SURVEY_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/form")
def get_form():
    return load_survey_json()


@app.post("/responses")
def create_response(payload: dict[str, Any]):
    session = get_session()
    try:
        respondent_name = payload.get("respondentName", "Anonymous")
        answers_payload = payload.get("answers", [])
        response_record = SurveyResponse(respondent_name=respondent_name)
        session.add(response_record)
        session.flush()

        for answer in answers_payload:
            question = answer.get("question", {})
            session.add(
                Answer(
                    response_id=response_record.id,
                    question_id=question.get("id", ""),
                    question_text=question.get("text", ""),
                    selected_options=answer.get("selectedOptions"),
                    typed_answer=answer.get("typedAnswer"),
                )
            )

        session.commit()
        return {"success": True, "message": "Survey submitted successfully."}
    except Exception as exc:
        session.rollback()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        session.close()


@app.post("/admin/login")
def admin_login(payload: dict[str, str]):
    username = payload.get("username", "")
    password = payload.get("password", "")
    session = get_session()
    try:
        admin_user = session.query(Admin).filter(Admin.username == username).first()
        if admin_user and pwd_context.verify(password, admin_user.password_hash):
            return {"success": True, "message": "Login successful."}
        raise HTTPException(status_code=401, detail="Invalid credentials")
    finally:
        session.close()


@app.get("/admin/responses")
def admin_responses():
    session = get_session()
    try:
        responses = session.query(SurveyResponse).order_by(SurveyResponse.submitted_at.desc()).all()
        result = []
        for response in responses:
            result.append(
                {
                    "id": response.id,
                    "respondentName": response.respondent_name,
                    "submittedAt": response.submitted_at.isoformat() if response.submitted_at else None,
                    "answers": [
                        {
                            "questionId": answer.question_id,
                            "questionText": answer.question_text,
                            "selectedOptions": answer.selected_options,
                            "typedAnswer": answer.typed_answer,
                        }
                        for answer in response.answers
                    ],
                }
            )
        return result
    finally:
        session.close()


@app.get("/admin/export")
def export_responses():
    session = get_session()
    try:
        responses = session.query(SurveyResponse).order_by(SurveyResponse.submitted_at.desc()).all()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Name", "Submitted At", "Q1", "Q2", "Q3", "Q4", "Q5a", "Q6a", "Q7a", "Q8a", "Q9a", "Q5b", "Q6b", "Q7b", "Q10", "Q11"])

        for response in responses:
            answer_map = {answer.question_id: answer for answer in response.answers}
            row = [
                response.respondent_name,
                response.submitted_at.isoformat() if response.submitted_at else "",
            ]
            for qid in ["Q1", "Q2", "Q3", "Q4", "Q5a", "Q6a", "Q7a", "Q8a", "Q9a", "Q5b", "Q6b", "Q7b", "Q10", "Q11"]:
                ans = answer_map.get(qid)
                if not ans:
                    row.append("")
                elif ans.selected_options:
                    row.append(", ".join(ans.selected_options) if isinstance(ans.selected_options, list) else str(ans.selected_options))
                else:
                    row.append(ans.typed_answer or "")
            writer.writerow(row)
        response_body = FastAPIResponse(content=output.getvalue(), media_type="text/csv")
        response_body.headers["Content-Disposition"] = "attachment; filename=survey_responses.csv"
        return response_body
    finally:
        session.close()


@app.get("/admin/config")
def admin_config():
    return {
        "databaseUrl": get_database_url(),
        "adminUsername": ADMIN_USERNAME,
    }


@app.post("/admin/config")
def save_admin_config(payload: dict[str, str]):
    username = payload.get("username", "")
    password = payload.get("password", "")
    database_url = payload.get("databaseUrl", "")

    session = get_session()
    try:
        admin_user = session.query(Admin).filter(Admin.username == username).first()
        if not admin_user or not pwd_context.verify(password, admin_user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid admin credentials")

        if not database_url:
            raise HTTPException(status_code=400, detail="Database URL is required")

        save_app_config({"DATABASE_URL": database_url})
        Base.metadata.create_all(bind=get_engine())
        return {"success": True, "message": "Database URL updated."}
    finally:
        session.close()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=PORT)

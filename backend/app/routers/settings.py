from fastapi import APIRouter
from pydantic import BaseModel
import os
import json

router = APIRouter()

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "settings.json")

class SettingsData(BaseModel):
    openai_api_key: str = ""

@router.get("/")
def get_settings():
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            try:
                data = json.load(f)
                key = data.get("openai_api_key", "")
                # Return masked key
                masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else key
                return {"openai_api_key": masked, "has_key": bool(key)}
            except Exception:
                pass
    return {"openai_api_key": "", "has_key": False}

@router.post("/")
def save_settings(data: SettingsData):
    # Only save if the user actually typed a new key (not the masked one)
    if "..." in data.openai_api_key and len(data.openai_api_key) < 20: 
        return {"ok": True}
        
    settings = {}
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            try:
                settings = json.load(f)
            except Exception:
                pass
    
    settings["openai_api_key"] = data.openai_api_key
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(settings, f)
        
    return {"ok": True}

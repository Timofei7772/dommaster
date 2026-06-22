from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel, Field
from app.database import get_db
from app.models.template import MessageTemplate

router = APIRouter()

# --- Pydantic Schemas ---
class TemplateCreate(BaseModel):
    stage: str = "common"
    title: str = Field(..., min_length=1, max_length=300)
    content: str = Field(..., min_length=1)
    template_type: str = "TEMPLATE"
    is_active: bool = True

class TemplateUpdate(BaseModel):
    stage: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    template_type: Optional[str] = None
    is_active: Optional[bool] = None

class TemplateResponse(BaseModel):
    id: int
    stage: str
    title: str
    content: str
    template_type: str
    is_active: bool

    class Config:
        orm_mode = True


# --- Endpoints ---
@router.get("/", response_model=List[TemplateResponse])
def get_templates(stage: Optional[str] = None, template_type: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(MessageTemplate)
    if stage:
        query = query.filter(MessageTemplate.stage == stage)
    if template_type:
        query = query.filter(MessageTemplate.template_type == template_type)
    return query.all()

@router.post("/", response_model=TemplateResponse)
def create_template(data: TemplateCreate, db: Session = Depends(get_db)):
    db_item = MessageTemplate(**data.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item

@router.put("/{template_id}", response_model=TemplateResponse)
def update_template(template_id: int, data: TemplateUpdate, db: Session = Depends(get_db)):
    db_item = db.query(MessageTemplate).filter(MessageTemplate.id == template_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Template not found")
    
    update_data = data.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_item, key, value)
    
    db.commit()
    db.refresh(db_item)
    return db_item

@router.delete("/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    db_item = db.query(MessageTemplate).filter(MessageTemplate.id == template_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(db_item)
    db.commit()
    return {"ok": True}

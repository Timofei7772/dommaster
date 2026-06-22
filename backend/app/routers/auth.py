"""
Роутер аутентификации пользователей и управления JWT сессиями
"""

from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.user import User, UserRole
from app.models.company import Company

router = APIRouter()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")


# --- Вспомогательные функции безопасности ---

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_token(data: dict, expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Не удалось подтвердить учетные данные",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    result = await db.execute(
        select(User)
        .where(User.email == email, User.is_active == True)
        .options(selectinload(User.company))
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_exception
    return user


# --- Схемы данных (Pydantic) ---

class UserRegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=6, description="Минимум 6 символов")
    full_name: str = Field(..., min_length=1, max_length=200)
    phone: Optional[str] = None
    role: UserRole = UserRole.OWNER
    company_name: Optional[str] = Field(None, description="Название компании для роли OWNER")


class UserLoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class CompanyResponse(BaseModel):
    id: int
    name: str
    logo: Optional[str] = None
    bank_details: Optional[str] = None

    class Config:
        from_attributes = True


class UserProfileResponse(BaseModel):
    id: int
    email: str
    full_name: str
    phone: Optional[str] = None
    position: Optional[str] = None
    role: UserRole
    company_id: Optional[int] = None
    company: Optional[CompanyResponse] = None

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserProfileResponse


# --- Эндпоинты API ---

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Регистрация нового владельца компании или пользователя"""
    # Проверяем уникальность email
    existing_user_result = await db.execute(select(User).where(User.email == data.email))
    if existing_user_result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким email уже зарегистрирован"
        )

    company = None
    # Создаем компанию если роль - OWNER и передано имя компании
    if data.role == UserRole.OWNER:
        company_name = data.company_name or f"Компания {data.full_name}"
        company = Company(name=company_name)
        db.add(company)
        await db.flush()  # Получаем ID компании

    # Создаем пользователя
    new_user = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        phone=data.phone,
        role=data.role,
        company_id=company.id if company else None,
        position="Владелец" if data.role == UserRole.OWNER else "Сотрудник"
    )

    db.add(new_user)
    await db.flush()

    # Генерируем токены
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=30)
    
    access_token = create_token({"sub": new_user.email}, access_token_expires)
    refresh_token = create_token({"sub": new_user.email, "type": "refresh"}, refresh_token_expires)

    new_user.refresh_token = refresh_token
    await db.commit()

    # Загружаем связи для ответа
    result = await db.execute(
        select(User)
        .where(User.id == new_user.id)
        .options(selectinload(User.company))
    )
    user_loaded = result.scalar_one()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user_loaded
    }


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLoginRequest, db: AsyncSession = Depends(get_db)):
    """Вход по email и паролю"""
    result = await db.execute(
        select(User)
        .where(User.email == data.email, User.is_active == True)
        .options(selectinload(User.company))
    )
    user = result.scalar_one_or_none()
    
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Неверный email или пароль"
        )

    # Генерируем токены
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=30)
    
    access_token = create_token({"sub": user.email}, access_token_expires)
    refresh_token = create_token({"sub": user.email, "type": "refresh"}, refresh_token_expires)

    user.refresh_token = refresh_token
    user.last_login = datetime.utcnow()
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "user": user
    }


@router.post("/refresh", response_model=TokenResponse)
async def refresh(data: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Обновление сессии с помощью refresh токена"""
    try:
        payload = jwt.decode(data.refresh_token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        token_type: str = payload.get("type")
        if email is None or token_type != "refresh":
            raise HTTPException(status_code=401, detail="Невалидный refresh токен")
    except JWTError:
        raise HTTPException(status_code=401, detail="Невалидный refresh токен")

    result = await db.execute(
        select(User)
        .where(User.email == email, User.refresh_token == data.refresh_token, User.is_active == True)
        .options(selectinload(User.company))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Сессия не найдена или устарела")

    # Выпуск новых токенов
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    refresh_token_expires = timedelta(days=30)
    
    access_token = create_token({"sub": user.email}, access_token_expires)
    new_refresh_token = create_token({"sub": user.email, "type": "refresh"}, refresh_token_expires)

    user.refresh_token = new_refresh_token
    await db.commit()

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "user": user
    }


@router.get("/me", response_model=UserProfileResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Получение профиля текущего пользователя"""
    return current_user

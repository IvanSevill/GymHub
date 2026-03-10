from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.core.database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String, nullable=True) # Optional if using Google Login exclusively
    
    name = Column(String, nullable=True)
    picture_url = Column(String, nullable=True)
    is_root = Column(Integer, default=0) # 0 = False, 1 = True
    
    workouts = relationship("Workout", back_populates="user")
    tokens = relationship("UserToken", back_populates="user", uselist=False, cascade="all, delete-orphan")

    def get_or_create_tokens(self, db):
        from .auth import UserToken
        if not self.tokens:
            self.tokens = UserToken(user_id=self.id)
            db.add(self.tokens)
            db.flush()
        return self.tokens

    # Shortcut properties for convenience if needed, 
    # but the goal is to shift logic to user.tokens
    @property
    def google_access_token(self): return self.tokens.google_access_token if self.tokens else None
    @google_access_token.setter
    def google_access_token(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.google_access_token = value

    @property
    def google_refresh_token(self): return self.tokens.google_refresh_token if self.tokens else None
    @google_refresh_token.setter
    def google_refresh_token(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.google_refresh_token = value

    @property
    def fitbit_access_token(self): return self.tokens.fitbit_access_token if self.tokens else None
    @fitbit_access_token.setter
    def fitbit_access_token(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.fitbit_access_token = value

    @property
    def fitbit_refresh_token(self): return self.tokens.fitbit_refresh_token if self.tokens else None
    @fitbit_refresh_token.setter
    def fitbit_refresh_token(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.fitbit_refresh_token = value

    @property
    def selected_calendar_id(self): return self.tokens.selected_calendar_id if self.tokens else None
    @selected_calendar_id.setter
    def selected_calendar_id(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.selected_calendar_id = value

    @property
    def google_id(self): return self.tokens.google_id if self.tokens else None
    @google_id.setter
    def google_id(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.google_id = value

    @property
    def fitbit_id(self): return self.tokens.fitbit_id if self.tokens else None
    @fitbit_id.setter
    def fitbit_id(self, value):
        if not self.tokens:
            from .auth import UserToken
            self.tokens = UserToken()
        self.tokens.fitbit_id = value

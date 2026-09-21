from pydantic import BaseModel


class LogoutResponse(BaseModel):
    logoutUrl: str | None = None

from pydantic import BaseModel


class AiStatusOut(BaseModel):
    """What the client may know about the Elpis connection.

    No URL, key or agent id leaves the server; the client only needs to know
    which capabilities to show.
    """

    configured: bool
    refine: bool
    chat: bool

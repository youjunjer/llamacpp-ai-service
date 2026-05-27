from __future__ import annotations

import os

import uvicorn


if __name__ == "__main__":
    certfile = os.getenv("WEBUI_SSL_CERT")
    keyfile = os.getenv("WEBUI_SSL_KEY")
    uvicorn.run(
        "app.main:app",
        host=os.getenv("WEBUI_HOST", "0.0.0.0"),
        port=int(os.getenv("WEBUI_PORT", "8000")),
        reload=False,
        ssl_certfile=certfile,
        ssl_keyfile=keyfile,
    )

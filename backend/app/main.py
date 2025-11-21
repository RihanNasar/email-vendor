from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from app.config import settings
from app.models.database import init_db
from app.api.endpoints import router


# Create FastAPI app
app = FastAPI(
    title=settings.app_name,
    description="Intelligent Email Agent for Logistics and Shipping Requests",
    version="1.0.0",
    debug=settings.debug
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000", "*"],  # Frontend origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with response_model_by_alias to use camelCase in responses
app.include_router(router, prefix="/api/v1", tags=["Email Agent"])


@app.on_event("startup")
async def startup_event():
    """Initialize database on startup"""
    init_db()
    print(f"{settings.app_name} started successfully!")
    print(f"Environment: {settings.app_env}")
    print(f"Debug mode: {settings.debug}")


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": settings.app_name,
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs"
    }


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=settings.debug
    )

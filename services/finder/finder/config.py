"""Validated, centralized Finder configuration."""

from __future__ import annotations

from dataclasses import dataclass

SUPPORTED_CATEGORIES: tuple[str, ...] = (
    "inmobiliaria", "desarrolladora inmobiliaria", "constructora",
    "estudio de arquitectura", "arquitecto", "diseño de interiores",
    "mueblería", "fábrica de muebles", "aberturas", "carpintería de aluminio",
    "iluminación", "casa de electricidad", "pisos y revestimientos", "cerámicos",
    "sanitarios", "cocinas", "decoración", "piscinas", "paisajismo", "hotel",
    "hotel boutique", "cabañas", "complejo turístico", "agencia de turismo",
    "salón de eventos", "centro de convenciones", "productora de eventos",
    "concesionaria de autos", "concesionaria de motos", "maquinaria agrícola",
    "maquinaria industrial", "fábrica", "empresa industrial", "showroom",
    "local de diseño", "bodega", "restaurante premium",
)

DRY_RUN_MAX_LIMIT = 25


@dataclass(frozen=True, slots=True)
class SearchConfig:
    category: str
    location: str
    limit: int = 10

    def __post_init__(self) -> None:
        category = " ".join(self.category.split()).lower()
        location = " ".join(self.location.split())
        if category not in SUPPORTED_CATEGORIES:
            raise ValueError(f"unsupported category: {self.category}")
        if not location:
            raise ValueError("location must not be empty")
        if not isinstance(self.limit, int) or isinstance(self.limit, bool):
            raise ValueError("limit must be an integer")
        if not 1 <= self.limit <= DRY_RUN_MAX_LIMIT:
            raise ValueError(f"limit must be between 1 and {DRY_RUN_MAX_LIMIT}")
        object.__setattr__(self, "category", category)
        object.__setattr__(self, "location", location)

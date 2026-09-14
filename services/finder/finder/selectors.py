"""Google Maps selectors kept in one auditable module."""

SEARCH_FEED = 'div[role="feed"]'
PLACE_LINK = 'a[href*="/maps/place/"]'
BUSINESS_NAME = "h1"
DETAIL_ITEMS = "button[data-item-id], a[data-item-id]"
CATEGORY = 'button[jsaction*="pane.rating.category"]'
ADDRESS = '[data-item-id="address"]'

# These text labels are UI-dependent and may change with locale.
CONSENT_LABELS = ("Aceptar todo", "Accept all", "Acepto", "I agree")


"""Spider template for extracting business leads from Google Maps search results.

Set `target_query` (e.g. ``"2 wheeler insurance Kenya"``) and optionally `location`,
then the spider loads the Maps search page in a stealth browser, scrolls the
results feed, and yields one item per business card. When `enrich_website` is
enabled, each card's website is fetched in a second pass to extract emails,
phones, client links, and business info.

Example:
    class MyMapsSpider(GoogleMapsSpider):
        name = "kenya_insurance"
        target_query = "2 wheeler insurance"
        location = "Kenya"
        max_results = 50
"""

import re
from asyncio import sleep
from urllib.parse import quote_plus

from scrapling.fetchers import AsyncStealthySession
from scrapling.spiders.request import Request
from scrapling.spiders.spider import Spider
from scrapling.core._types import (
    TYPE_CHECKING,
    Any,
    AsyncGenerator,
    Dict,
    List,
    Union,
)

if TYPE_CHECKING:
    from scrapling.engines.toolbelt.custom import Response
    from scrapling.parser import Selector
    from scrapling.spiders.session import SessionManager


__all__ = ["GoogleMapsSpider", "build_maps_url", "extract_maps_cards", "scroll_feed"]


EMAIL_RE = re.compile(r"[\w\.-]+@[\w\.-]+\.\w+")
PHONE_RE = re.compile(r"\+?\d[\d\s().\-]{6,}\d")
RATING_RE = re.compile(r"(\d+(?:[.,]\d+)?)")
REVIEWS_RE = re.compile(r"\(?([\d,]+)\)?\s*reviews?", re.IGNORECASE)
HOURS_RE = re.compile(
    r"(Open(?:\s+24 hours|\s+now)?[^\n]*|Closed[^\n]*|Opens[^\n]*|Closes[^\n]*)",
    re.IGNORECASE,
)

_CARD_SELECTORS = (
    'div[role="article"]',
    "div[data-result-index]",
    'a[href*="/maps/place/"]',
)

_END_OF_LIST_MARKER = "You've reached the end"


def build_maps_url(query: str, location: str = "") -> str:
    """Build a Google Maps search URL from a query and an optional location."""
    full = f"{query.strip()} {location.strip()}".strip()
    return f"https://www.google.com/maps/search/{quote_plus(full)}/"


async def scroll_feed(page: Any, max_scrolls: int = 20) -> None:
    """Scroll the Maps results feed until the end marker appears or `max_scrolls` hits.

    :param page: Playwright page object (passed automatically as `page_action`).
    :param max_scrolls: Maximum number of scroll iterations.
    """
    for _ in range(max(0, max_scrolls)):
        try:
            state = await page.evaluate(
                """() => {"""
                """  const feed = document.querySelector('div[role="feed"]');"""
                """  if (!feed) return "no-feed";"""
                """  feed.scrollTop = feed.scrollHeight;"""
                """  const text = document.body ? document.body.innerText : "";"""
                f"""  return text.includes("{_END_OF_LIST_MARKER}") ? "end" : "more";"""
                """}"""
            )
        except Exception:
            break
        if state in ("end", "no-feed"):
            break
        try:
            await page.wait_for_timeout(2000)
        except Exception:
            try:
                await sleep(2)
            except Exception:
                break


def extract_maps_cards(selector: Union["Selector", "Response"]) -> List["Selector"]:
    """Return result cards from a Maps search page, trying selector fallbacks in order.

    Usable standalone with any `Selector`/`Response` object.
    """
    for css in _CARD_SELECTORS:
        try:
            cards = selector.css(css)
        except Exception:
            continue
        if cards:
            return list(cards)
    return []


def _first_text(card: "Selector", selectors: List[str]) -> str:
    for css in selectors:
        try:
            value = card.css(css).get()
        except Exception:
            continue
        if value and str(value).strip():
            return str(value).strip()
    return ""


def _first_attr(card: "Selector", selectors: List[str]) -> str:
    return _first_text(card, selectors)


def _extract_card(card: "Selector") -> Dict[str, Any]:
    """Extract every supported field from a single Maps result card."""
    name = _first_text(card, ['div[role="heading"]::text', '[role="heading"]::text']) or str(
        card.attrib.get("aria-label", "") or ""
    ).strip() or _first_attr(card, ['a[aria-label]::attr(aria-label)'])

    address = _first_text(
        card, ['button[data-item-id*="address"]::text', '[data-item-id*="address"]::text']
    )
    phone = _first_text(
        card,
        [
            'button[data-item-id*="phone"]::text',
            '[data-item-id*="phone"]::text',
            'a[href^="tel:"]::text',
        ],
    ) or _first_attr(card, ['a[href^="tel:"]::attr(href)']).replace("tel:", "").strip()

    website = _first_attr(
        card,
        [
            'a[data-value="Website"]::attr(href)',
            'a[data-item-id*="website"]::attr(href)',
        ],
    )
    if not website:
        try:
            hrefs = [str(h).strip() for h in card.css("a::attr(href)").getall()]
        except Exception:
            hrefs = []
        for link in hrefs:
            if link.startswith("http") and "google." not in link:
                website = link
                break

    maps_url = ""
    candidates = []
    self_href = str(card.attrib.get("href", "") or "").strip()
    if self_href:
        candidates.append(self_href)
    try:
        candidates += [str(h).strip() for h in card.css("a::attr(href)").getall()]
    except Exception:
        pass
    for link in candidates:
        if "/maps/place/" in link:
            maps_url = link
            break

    rating = None
    reviews = None
    try:
        labels = [str(v) for v in card.css('span[role="img"]::attr(aria-label)').getall()]
    except Exception:
        labels = []
    label_text = " ".join(labels)
    match = RATING_RE.search(label_text)
    if match:
        try:
            rating = float(match.group(1).replace(",", "."))
        except ValueError:
            rating = None
    match = REVIEWS_RE.search(label_text)
    if match:
        try:
            reviews = int(match.group(1).replace(",", ""))
        except ValueError:
            reviews = None

    hours = ""
    try:
        card_text = str(card.get_all_text(separator="\n", strip=True))
    except Exception:
        card_text = ""
    if card_text:
        match = HOURS_RE.search(card_text)
        if match:
            hours = match.group(1).strip()

    return {
        "name": name,
        "phone": phone,
        "address": address,
        "website": website,
        "rating": rating,
        "reviews": reviews,
        "hours": hours,
        "emails": [],
        "maps_url": maps_url,
    }


class GoogleMapsSpider(Spider):
    """A spider that extracts business leads from Google Maps search results.

    Set `target_query` (and optionally `location`), then each Maps result card
    yields one item. With `enrich_website` enabled, every card that has a
    website schedules a second-pass request to `parse_website`, which merges
    emails, phones, client links, and business info into the item.

    :cvar target_query: Search query, e.g. ``"2 wheeler insurance Kenya"``.
    :cvar location: Optional location appended to the query.
    :cvar max_scrolls: Maximum feed-scroll iterations on the search page.
    :cvar max_results: Maximum number of business cards to process.
    :cvar enrich_website: Fetch each website to extract emails/phones/clients.
    :cvar fields: Item field names to keep. ``maps_url`` is always kept.
    """

    name = "googlemaps"
    target_query: str = ""
    location: str = ""
    max_scrolls: int = 20
    max_results: int = 100
    enrich_website: bool = True
    fields: List[str] = ["name", "phone", "address", "website", "rating", "reviews", "hours", "emails"]

    def configure_sessions(self, manager: "SessionManager") -> None:
        manager.add(
            "default",
            AsyncStealthySession(headless=True, solve_cloudflare=False, network_idle=True),
        )

    async def start_requests(self) -> AsyncGenerator[Request, None]:
        urls = list(self.start_urls)
        if not urls:
            if not self.target_query:
                raise RuntimeError(
                    f"{self.__class__.__name__} must set `target_query` (or `start_urls`)"
                )
            urls = [build_maps_url(self.target_query, self.location)]

        max_scrolls = self.max_scrolls

        async def _scroll(page: Any) -> None:
            await scroll_feed(page, max_scrolls=max_scrolls)

        for url in urls:
            yield Request(url, callback=self.parse, page_action=_scroll)

    async def parse(self, response: "Response") -> AsyncGenerator[Union[Dict[str, Any], Request, None], None]:
        count = 0
        for card in extract_maps_cards(response):
            if count >= self.max_results:
                break
            full = _extract_card(card)
            if not full.get("name") and not full.get("maps_url"):
                continue
            count += 1
            item = {k: v for k, v in full.items() if k in self.fields or k == "maps_url"}
            yield item
            if self.enrich_website and full.get("website"):
                yield Request(
                    str(full["website"]),
                    callback=self.parse_website,
                    meta={"item": item},
                    dont_filter=True,
                )

    async def parse_website(self, response: "Response") -> AsyncGenerator[Union[Dict[str, Any], Request, None], None]:
        item = dict(response.meta.get("item", {}))
        try:
            html = response.body.decode(response.encoding or "utf-8", errors="replace")
        except Exception:
            html = ""

        emails = list(dict.fromkeys(EMAIL_RE.findall(html)))

        phones: List[str] = []
        for raw in PHONE_RE.findall(html):
            phone = raw.strip()
            digits = re.sub(r"\D", "", phone)
            if 7 <= len(digits) <= 15 and phone not in phones:
                phones.append(phone)
        if item.get("phone") and item["phone"] not in phones:
            phones.insert(0, str(item["phone"]))

        try:
            hrefs = [str(h).strip() for h in response.css("a::attr(href)").getall()]
        except Exception:
            hrefs = []
        clients: List[str] = []
        for href in hrefs:
            lowered = href.lower()
            if ("clients" in lowered or "portfolio" in lowered) and href not in clients:
                try:
                    clients.append(response.urljoin(href))
                except Exception:
                    clients.append(href)

        try:
            title = str(response.css("title::text").get() or "").strip()
        except Exception:
            title = ""
        try:
            description = str(response.css('meta[name="description"]::attr(content)').get() or "").strip()
        except Exception:
            description = ""
        try:
            h1 = str(response.css("h1::text").get() or "").strip()
        except Exception:
            h1 = ""

        item["emails"] = emails
        item["phones"] = phones
        item["clients"] = clients
        item["main_business"] = title or h1
        item["description"] = description
        yield item

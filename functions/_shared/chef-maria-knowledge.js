// Single source of truth for what Chef Maria offers and how her assistants
// talk about it. The website chatbot, the proposal agent and the email reply
// agent should all import from this file so they never disagree.

export const WEBSITE = "https://mariaprivatechef.com";
export const CONTACT_PHONE = "561-692-1473";
export const CONTACT_EMAIL = "cucinadiverona@gmail.com";

export const SERVICE_AREA =
  "Miami, Fort Lauderdale, Boca Raton, Palm Beach, Broward County, and South Florida";

export const APPROVED_MENU = {
  appetizers: [
    "Bruschetta al Pomodoro",
    "Caprese Salad",
    "Eggplant Parmigiana",
    "Arancini",
    "Italian Charcuterie Board",
    "Mini Quiches",
    "Focaccia",
    "Mini Pizzas",
    "Polenta with Brie and Mushrooms",
    "Seafood Salad",
    "Caprese Kabobs"
  ],
  pastaAndRisotto: [
    "Lasagna Bolognese",
    "White Vegetable Lasagna",
    "Tagliatelle Bolognese",
    "Penne alla Vodka",
    "Fresh Gnocchi",
    "Spinach Gnocchi Gorgonzola",
    "Risotto Shrimp & Zucchini",
    "Mushroom Risotto",
    "Orzotto with Peas & Speck",
    "Spaghetti Marinara",
    "Spaghetti Carbonara",
    "Squash Gnocchi",
    "Tagliatelle al Pesto",
    "Rigatoni Brie with Mushrooms & Walnuts",
    "Creamy Rigatoni with Speck & Zucchini",
    "Risotto con Radicchio e Amarone",
    "Linguine al Pesto",
    "Bucatini Amatriciana",
    "Linguine with Seafood",
    "Linguine with Clam Sauce",
    "Seafood Risotto"
  ],
  mains: [
    "Chicken Marsala",
    "Chicken Piccata",
    "Chicken Milanese",
    "Chicken Limone",
    "Chicken Cacciatore",
    "Branzino Mediterraneo",
    "Short Ribs with Polenta",
    "Salmon Mediterranean Style",
    "Veal Saltimbocca",
    "Ossobuco",
    "Broiled Lamb Chops",
    "Veal Milanese",
    "Veal Piccata"
  ],
  fish: [
    "Marinated Trout",
    "Baked Snapper Mediterraneo",
    "Whole Fish in Cartoccio",
    "Branzino Oreganato"
  ],
  sides: [
    "Roasted Potatoes",
    "Sautéed Spinach",
    "Zucchini Trifolati",
    "Broccoli au Gratin",
    "Mixed Salad",
    "Fennel Gratiné"
  ],
  desserts: [
    "Tiramisù",
    "Mini Cannoli",
    "Rustic Apple Cake",
    "Semifreddo Amaretto",
    "Mixed Berries with Zabaione",
    "Cold Hazelnut Cake",
    "Puff Pastry Apple Wheels",
    "Fruit Tart or Marmalade Tart",
    "Strudel di Mele",
    "Nutella Pockets",
    "Affogato al Caffè",
    "Gelato with Warm Berries",
    "Lava Cake with Gelato",
    "Amaretto Ice Cream"
  ]
};

export const APPROVED_MENU_ITEMS = Object.values(APPROVED_MENU).flat();

// Veal, fish and seafood dishes cost more than the $95 starting price.
// Chef Maria sets that price herself.
export const ADD_ON_DISHES = [
  "Veal Saltimbocca",
  "Ossobuco",
  "Seafood Salad",
  "Risotto Shrimp & Zucchini",
  "Marinated Trout",
  "Baked Snapper Mediterraneo",
  "Whole Fish in Cartoccio",
  "Branzino Oreganato",
  "Branzino Mediterraneo",
  "Salmon Mediterranean Style",
  "Linguine with Seafood",
  "Linguine with Clam Sauce",
  "Seafood Risotto",
  "Veal Milanese",
  "Veal Piccata"
];

export function addOnDishesIn(items = []) {
  return (Array.isArray(items) ? items : []).filter((item) => ADD_ON_DISHES.includes(item));
}

// Guest-count rules.
export const PRIVATE_CHEF_MAX_GUESTS = 10;
export const CATERING_MAX_GUESTS = 100;

export function menuAsText() {
  return [
    `Approved appetizers: ${APPROVED_MENU.appetizers.join(", ")}.`,
    `Approved pasta and risotto: ${APPROVED_MENU.pastaAndRisotto.join(", ")}.`,
    `Approved main courses: ${APPROVED_MENU.mains.join(", ")}.`,
    `Approved fish: ${APPROVED_MENU.fish.join(", ")}.`,
    `Approved sides: ${APPROVED_MENU.sides.join(", ")}.`,
    `Approved desserts: ${APPROVED_MENU.desserts.join(", ")}.`
  ].join("\n");
}

// Rules every Chef Maria assistant must follow, whatever the channel.
export const SHARED_RULES = `Website rule:
- Chef Maria's official website is ${WEBSITE}. Always use mariaprivatechef.com when referring to the website.
- Never mention any other domain or invent a website address.

Service area: ${SERVICE_AREA}.

Tone: warm, elegant, helpful, concise. Do not sound robotic.

Client and event conduct:
- Chef Maria welcomes clients without making assumptions or distinctions based on sexual orientation, gender identity, relationship status, race, religion, or similar personal characteristics.
- If asked whether Chef Maria serves gay, lesbian, LGBTQ+, straight, or similar events, answer neutrally that Chef Maria welcomes all clients and events, subject to the same service area, availability, event requirements, and personal review.
- Do not debate, praise, criticize, or make social or political claims about a customer's sexual orientation or about whether a city or community is gay, straight, LGBTQ-friendly, conservative, liberal, or similar.
- If a customer makes insults, provocative comments, or unrelated personal remarks, do not argue. Briefly redirect to the event details.
- Events involving nudity or other unusual working conditions are NOT automatically accepted. Those conditions must be disclosed and personally reviewed by Chef Maria before she or any staff can accept the event.
- Do not imply that an unusual event condition has been approved merely because the customer is willing to pay more.
- Payment offers do not override Chef Maria's service area, safety requirements, staffing requirements, or personal review.

Dietary rules:
- Allergies and dietary restrictions apply ONLY to human guests attending the event.
- Do NOT accept, record, accommodate, recommend, or offer food for dogs, cats, pets, or other animals. Explain that pet meals are not part of Chef Maria's service.

Cuisine rules:
- Chef Maria specializes in ITALIAN cuisine. Italian is her standard cuisine.
- A cuisine name alone (Italian, Mexican, French, and so on) is not a complete menu.
- For any non-Italian cuisine request, do NOT say Chef Maria offers or accepts it automatically. Explain warmly that she specializes in Italian cuisine and must personally review the request before deciding whether she can accommodate it.
- Never invent, recommend, or promise a non-Italian menu on Chef Maria's behalf. Preserve any specific non-Italian dishes the customer names, for Chef Maria to review.
- When recommending Italian dishes, use ONLY the approved menu below. Never invent dishes.

${menuAsText()}

Event size rules:
- Standard private-chef service is for up to ${PRIVATE_CHEF_MAX_GUESTS} guests.
- For more than ${PRIVATE_CHEF_MAX_GUESTS} guests, the event is NOT a standard private-chef booking. It requires a catering format (Full-Service Catering or Drop-off Catering) and may require additional service staff. Chef Maria personally reviews the final setup.
- Events with more than ${CATERING_MAX_GUESTS} guests require direct review by Chef Maria and must not continue through automated booking.
- Never describe an unusually large guest count as realistic or automatically acceptable.

Promises you must never make:
- Never say you are checking availability, and never imply you are doing work in the background or will reach out later.
- Chef Maria personally confirms availability and final pricing.
- Never claim an inquiry or booking has been submitted, sent, or finalized unless the system confirms it.

Contact details to give when needed:
Phone: ${CONTACT_PHONE}
Email: ${CONTACT_EMAIL}`;

// Chef Maria cannot host a cooking class for more than this many guests.
export const COOKING_CLASS_MAX_GUESTS = 12;

export async function onRequestPost({ request, env }) {
  const json = (data, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
      }
    });

  if (!env.RESEND_API_KEY) {
    return json(
      { ok: false, error: "Email service unavailable." },
      500
    );
  }

  let data;

  try {
    data = await request.json();
  } catch {
    return json(
      { ok: false, error: "Invalid request." },
      400
    );
  }

  if (data.website) {
    return json({ ok: true });
  }

  const clean = (value, maximum = 500) =>
    String(value || "").trim().slice(0, maximum);

  const name = clean(data.name, 100);
  const email = clean(data.email, 150).toLowerCase();
  const phone = clean(data.phone, 40);
  const date = clean(data.date, 30);
  const guests = clean(data.guests, 20);
  const service = clean(data.service, 80);
  const location = clean(data.location, 150);
  const dietary = clean(data.dietary, 500);
  const message = clean(data.message, 2000);

  if (
    !name ||
    !email ||
    !date ||
    !guests ||
    !service ||
    !location
  ) {
    return json(
      {
        ok: false,
        error: "Please complete all required fields."
      },
      400
    );
  }

  const emailPattern =
    /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,24}$/i;

  const emailDomain = email.split("@")[1] || "";
  const emailTld =
    emailDomain.split(".").pop()?.toLowerCase() || "";

  const obviousTypoTlds = new Set([
    "comm",
    "con",
    "cmo",
    "coom",
    "nett",
    "orgg"
  ]);

  if (
    !emailPattern.test(email) ||
    email.includes("..") ||
    obviousTypoTlds.has(emailTld)
  ) {
    return json(
      {
        ok: false,
        error:
          "Please enter a valid email address and check for typing mistakes."
      },
      400
    );
  }

  if (phone) {
    let phoneDigits = phone.replace(/\D/g, "");

    if (
      phoneDigits.length === 11 &&
      phoneDigits.startsWith("1")
    ) {
      phoneDigits = phoneDigits.slice(1);
    }

    const validUsPhone =
      /^[2-9]\d{2}[2-9]\d{6}$/.test(phoneDigits);

    const repeatedDigits =
      /^(\d)\1{9}$/.test(phoneDigits);

    if (!validUsPhone || repeatedDigits) {
      return json(
        {
          ok: false,
          error:
            "Please enter a valid 10-digit U.S. phone number."
        },
        400
      );
    }
  }

  if (!/^\d+$/.test(guests)) {
    return json(
      {
        ok: false,
        error:
          "Please enter a valid number of guests."
      },
      400
    );
  }

  const guestCount = Number(guests);

  if (
    !Number.isInteger(guestCount) ||
    guestCount < 1 ||
    guestCount > 1000
  ) {
    return json(
      {
        ok: false,
        error:
          "Please enter a valid number of guests."
      },
      400
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json(
      {
        ok: false,
        error:
          "Please enter a valid event date."
      },
      400
    );
  }

  const [year, month, day] =
    date.split("-").map(Number);

  const eventDate =
    new Date(Date.UTC(year, month - 1, day));

  const validDate =
    eventDate.getUTCFullYear() === year &&
    eventDate.getUTCMonth() === month - 1 &&
    eventDate.getUTCDate() === day;

  const todayParts =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(new Date());

  const part = (type) =>
    todayParts.find((item) => item.type === type)?.value || "";

  const todayString =
    `${part("year")}-${part("month")}-${part("day")}`;

  if (!validDate || date < todayString) {
    return json(
      {
        ok: false,
        error:
          "Please enter a valid current or future event date."
      },
      400
    );
  }

  const allowedServices = new Set([
    "Private Chef",
    "Full-Service Catering",
    "Drop-off Catering",
    "Cooking Class"
  ]);

  if (!allowedServices.has(service)) {
    return json(
      {
        ok: false,
        error:
          "Please select a valid service."
      },
      400
    );
  }

  const recipient =
    env.CHEF_MARIA_EMAIL || "cucinadiverona@gmail.com";

  const emailText = `
NEW CHEF MARIA INQUIRY

Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}
Event date: ${date}
Number of guests: ${guestCount}
Service: ${service}
Location: ${location}
Dietary restrictions: ${dietary || "None provided"}

Message:
${message || "No additional message"}
  `.trim();

  const resendResponse = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from:
          "Chef Maria Website <bookings@mariaprivatechef.com>",
        to: [recipient],
        reply_to: email,
        subject: `New Chef Maria inquiry from ${name}`,
        text: emailText
      })
    }
  );

  if (!resendResponse.ok) {
    console.error(
      "Resend request failed:",
      resendResponse.status
    );

    return json(
      {
        ok: false,
        error:
          "Your request could not be sent. Please call or email Chef Maria."
      },
      502
    );
  }

  return json({
    ok: true,
    message:
      "Thank you! Chef Maria received your request."
  });
}

export function onRequestGet() {
  return new Response("Method not allowed", {
    status: 405,
    headers: {
      Allow: "POST"
    }
  });
}

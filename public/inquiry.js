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

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    return json(
      { ok: false, error: "Please enter a valid email." },
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
Number of guests: ${guests}
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

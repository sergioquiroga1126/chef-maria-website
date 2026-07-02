export async function onRequestGet({ env }) {
  if (!env.RESEND_API_KEY) {
    return Response.json({
      ok: false,
      error: "Missing RESEND_API_KEY in Cloudflare"
    });
  }

  const chefEmail = env.CHEF_MARIA_EMAIL || "cucinadiverona@gmail.com";

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "Chef Maria Website <bookings@mariaprivatechef.com>",
      to: [chefEmail],
      subject: "Chef Maria Test Email",
      text: "This is a test email from Cloudflare Pages Functions."
    })
  });

  const text = await resendResponse.text();

  return Response.json({
    ok: resendResponse.ok,
    status: resendResponse.status,
    chefEmail,
    resendResponse: text
  });
}

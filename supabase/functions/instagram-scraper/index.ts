const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

class InstagramAPI {
  private userAgents: string[];
  private headers: Record<string, string>;

  constructor() {
    this.userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1",
    ];

    this.headers = {
      "Accept": "application/json, text/plain, */*",
      "X-IG-App-ID": "936619743392459",
      "Referer": "https://www.instagram.com/",
    };
  }

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  async getUserInfo(username: string) {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    const headers = { ...this.headers, "User-Agent": this.getRandomUserAgent() };

    const response = await fetch(url, { headers });
    if (!response.ok) {
      return { error: `HTTP Error ${response.status}`, code: response.status };
    }

    return await response.json();
  }
}

Deno.serve(async (req: Request) => {
  // ✅ Handle preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const { username } = await req.json();

    if (!username) {
      return new Response(JSON.stringify({ error: "Username is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const api = new InstagramAPI();
    const result = await api.getUserInfo(username.trim());

    if (result.error) {
      return new Response(JSON.stringify({
        username,
        post_date: `Error: ${result.error}`,
        error: true,
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const edges = result?.data?.user?.edge_owner_to_timeline_media?.edges || [];
    let postDate = "No posts found";

    if (edges.length > 0) {
      const latest = edges
        .map((edge: any) => edge.node)
        .filter((node: any) => node?.taken_at_timestamp)
        .sort((a: any, b: any) => b.taken_at_timestamp - a.taken_at_timestamp)[0];

      if (latest?.taken_at_timestamp) {
        postDate = new Date(latest.taken_at_timestamp * 1000).toISOString().split("T")[0];
      }
    }

    return new Response(JSON.stringify({
      username,
      post_date: postDate,
      error: false,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({
      error: `Server error: ${err.message}`,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

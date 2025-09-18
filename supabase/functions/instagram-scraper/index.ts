const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

interface InstagramAPIResponse {
  data?: {
    user?: {
      edge_owner_to_timeline_media?: {
        edges?: Array<{
          node?: {
            taken_at_timestamp?: number;
          };
        }>;
      };
    };
  };
}

class InstagramAPI {
  private session: any;
  private userAgents: string[];
  private headers: Record<string, string>;

  constructor() {
    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Firefox/120.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0',
      'Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.116 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0.3 Mobile/15E148 Safari/604.1'
    ];
    
    this.headers = {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Cache-Control': 'max-age=0',
      'X-IG-App-ID': '936619743392459',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.instagram.com/',
    };
  }

  private getRandomUserAgent(): string {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async getUserInfo(username: string, maxRetries: number = 3): Promise<any> {
    const url = `https://www.instagram.com/api/v1/users/web_profile_info/?username=${username}`;
    
    const headers = {
      ...this.headers,
      'User-Agent': this.getRandomUserAgent()
    };

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers,
        });

        if (response.status === 404) {
          return { error: "User not found", code: 404 };
        } else if (response.status === 429) {
          const waitTime = (2 ** attempt) * 5 + Math.random();
          await this.sleep(waitTime * 1000);
          continue;
        } else if (response.status !== 200) {
          return { error: `HTTP Error ${response.status}`, code: response.status };
        }

        const data = await response.json();
        return data;
      } catch (error: any) {
        if (attempt === maxRetries - 1) {
          return { error: `Request failed: ${error.message}`, code: 0 };
        }
        await this.sleep((2 ** attempt + Math.random()) * 1000);
      }
    }

    return { error: "Max retries exceeded", code: 0 };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { username } = await req.json();
    
    if (!username || typeof username !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Username is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const api = new InstagramAPI();
    const result = await api.getUserInfo(username.trim());
    
    if (result.error) {
      return new Response(
        JSON.stringify({
          username,
          post_date: `Error: ${result.error}`,
          error: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    try {
      const userData = result.data?.user;
      const mediaEdges = userData?.edge_owner_to_timeline_media?.edges || [];
      
      let latestPost = null;
      
      if (mediaEdges.length > 0) {
        // Sort by timestamp and get the latest post
        const sortedPosts = mediaEdges
          .map(edge => edge.node)
          .filter(node => node && node.taken_at_timestamp)
          .sort((a, b) => (b?.taken_at_timestamp || 0) - (a?.taken_at_timestamp || 0));
        
        if (sortedPosts.length > 0) {
          latestPost = sortedPosts[0];
        }
      }

      let postDate = 'No posts found';
      
      if (latestPost && latestPost.taken_at_timestamp) {
        const date = new Date(latestPost.taken_at_timestamp * 1000);
        postDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
      }

      return new Response(
        JSON.stringify({
          username,
          post_date: postDate,
          error: false
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } catch (parseError: any) {
      return new Response(
        JSON.stringify({
          username,
          post_date: 'Error: Invalid response format',
          error: true
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: `Server error: ${error.message}` }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
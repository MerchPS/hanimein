const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ============ CONSUMET API (Most Reliable) ============
class ConsumetAPI {
  constructor() {
    // Menggunakan public API endpoint yang stabil
    this.apiUrl = 'https://api.consumet.org';
    this.fallbackUrl = 'https://consumet-api-production-2c1b.up.railway.app';
  }

  async request(endpoint) {
    try {
      // Coba primary API
      const response = await axios.get(`${this.apiUrl}${endpoint}`, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' }
      });
      return response.data;
    } catch (error) {
      try {
        // Fallback ke secondary API
        const response = await axios.get(`${this.fallbackUrl}${endpoint}`, {
          timeout: 10000
        });
        return response.data;
      } catch (err) {
        console.error(`API Error: ${endpoint}`, err.message);
        return null;
      }
    }
  }

  async getRecentAnime(page = 1) {
    const data = await this.request(`/meta/anilist/recent-episodes?page=${page}&perPage=24`);
    if (data && data.results) {
      return {
        animes: data.results.map(anime => ({
          id: anime.id,
          title: anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown',
          poster: anime.image,
          url: `/watch/${anime.id}`,
          source: 'AniList',
          episode: anime.episodeNumber,
          rating: anime.rating || 'N/A'
        }))
      };
    }
    return { animes: [] };
  }

  async getTrendingAnime(page = 1) {
    const data = await this.request(`/meta/anilist/trending?page=${page}&perPage=24`);
    if (data && data.results) {
      return {
        animes: data.results.map(anime => ({
          id: anime.id,
          title: anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown',
          poster: anime.image,
          url: `/watch/${anime.id}`,
          source: 'AniList',
          rating: anime.rating || anime.averageScore || 'N/A'
        }))
      };
    }
    return { animes: [] };
  }

  async getPopularAnime(page = 1) {
    const data = await this.request(`/meta/anilist/popular?page=${page}&perPage=24`);
    if (data && data.results) {
      return {
        animes: data.results.map(anime => ({
          id: anime.id,
          title: anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown',
          poster: anime.image,
          url: `/watch/${anime.id}`,
          source: 'AniList',
          rating: anime.rating || anime.averageScore || 'N/A'
        }))
      };
    }
    return { animes: [] };
  }

  async searchAnime(query, page = 1) {
    const data = await this.request(`/meta/anilist/${encodeURIComponent(query)}?page=${page}&perPage=24`);
    if (data && data.results) {
      return {
        animes: data.results.map(anime => ({
          id: anime.id,
          title: anime.title?.english || anime.title?.romaji || anime.title?.native || 'Unknown',
          poster: anime.image,
          url: `/watch/${anime.id}`,
          source: 'AniList',
          rating: anime.rating || anime.averageScore || 'N/A'
        }))
      };
    }
    return { animes: [] };
  }

  async getAnimeInfo(id) {
    const data = await this.request(`/meta/anilist/info/${id}`);
    if (data) {
      return {
        id: data.id,
        title: data.title?.english || data.title?.romaji || data.title?.native || 'Unknown',
        poster: data.image,
        banner: data.cover,
        sinopsis: data.description?.replace(/<[^>]*>/g, '') || 'Sinopsis tidak tersedia',
        rating: data.averageScore || data.rating,
        genres: data.genres || [],
        status: data.status,
        totalEpisodes: data.totalEpisodes,
        episodes: (data.episodes || []).map(ep => ({
          episode: ep.number,
          title: ep.title,
          url: `/watch/${id}/episode/${ep.number}`,
          id: ep.id
        }))
      };
    }
    return null;
  }

  async getEpisodeStream(id, episodeNum) {
    const data = await this.request(`/meta/anilist/watch/${id}/${episodeNum}`);
    if (data && data.sources) {
      return {
        videos: data.sources.filter(s => s.quality !== 'backup').map(s => ({
          url: s.url,
          quality: s.quality
        }))
      };
    }
    return { videos: [] };
  }
}

// ============ JIKAN API (Backup) ============
class JikanAPI {
  constructor() {
    this.baseUrl = 'https://api.jikan.moe/v4';
  }

  async getTopAnime(page = 1) {
    try {
      const response = await axios.get(`${this.baseUrl}/top/anime?page=${page}&limit=24`, {
        timeout: 10000
      });
      const data = response.data;
      return {
        animes: (data.data || []).map(anime => ({
          id: anime.mal_id,
          title: anime.title,
          poster: anime.images?.jpg?.image_url,
          url: `/anime/${anime.mal_id}`,
          source: 'MyAnimeList',
          rating: anime.score || 'N/A'
        }))
      };
    } catch (error) {
      console.error('Jikan error:', error.message);
      return { animes: [] };
    }
  }

  async searchAnime(query, page = 1) {
    try {
      const response = await axios.get(`${this.baseUrl}/anime?q=${encodeURIComponent(query)}&page=${page}&limit=24`, {
        timeout: 10000
      });
      const data = response.data;
      return {
        animes: (data.data || []).map(anime => ({
          id: anime.mal_id,
          title: anime.title,
          poster: anime.images?.jpg?.image_url,
          url: `/anime/${anime.mal_id}`,
          source: 'MyAnimeList',
          rating: anime.score || 'N/A'
        }))
      };
    } catch (error) {
      return { animes: [] };
    }
  }
}

// ============ STATIC FALLBACK DATA (Always works) ============
const FALLBACK_ANIMES = [
  { id: 1, title: "Solo Leveling", poster: "https://cdn.myanimelist.net/images/anime/1587/136390.jpg", source: "Popular", rating: "8.7", episode: "12" },
  { id: 2, title: "Jujutsu Kaisen Season 2", poster: "https://cdn.myanimelist.net/images/anime/1939/136373.jpg", source: "Popular", rating: "8.9", episode: "23" },
  { id: 3, title: "Attack on Titan Final Season", poster: "https://cdn.myanimelist.net/images/anime/1944/135428.jpg", source: "Popular", rating: "9.1", episode: "28" },
  { id: 4, title: "One Piece", poster: "https://cdn.myanimelist.net/images/anime/6/73245.jpg", source: "Popular", rating: "8.7", episode: "1000+" },
  { id: 5, title: "Demon Slayer: Swordsmith Village", poster: "https://cdn.myanimelist.net/images/anime/1805/132825.jpg", source: "Popular", rating: "8.6", episode: "11" },
  { id: 6, title: "Mashle: Magic and Muscles", poster: "https://cdn.myanimelist.net/images/anime/1370/135023.jpg", source: "Popular", rating: "8.0", episode: "12" },
  { id: 7, title: "Hell's Paradise", poster: "https://cdn.myanimelist.net/images/anime/1879/136174.jpg", source: "Popular", rating: "8.3", episode: "13" },
  { id: 8, title: "Oshi no Ko", poster: "https://cdn.myanimelist.net/images/anime/1266/135908.jpg", source: "Popular", rating: "8.9", episode: "11" },
  { id: 9, title: "Vinland Saga Season 2", poster: "https://cdn.myanimelist.net/images/anime/1432/135458.jpg", source: "Popular", rating: "8.8", episode: "24" },
  { id: 10, title: "My Hero Academia Season 6", poster: "https://cdn.myanimelist.net/images/anime/1054/121946.jpg", source: "Popular", rating: "8.5", episode: "25" },
  { id: 11, title: "Spy x Family Season 2", poster: "https://cdn.myanimelist.net/images/anime/1979/135545.jpg", source: "Popular", rating: "8.4", episode: "12" },
  { id: 12, title: "The Eminence in Shadow", poster: "https://cdn.myanimelist.net/images/anime/1110/135135.jpg", source: "Popular", rating: "8.2", episode: "20" },
  { id: 13, title: "Tokyo Revengers Season 2", poster: "https://cdn.myanimelist.net/images/anime/1834/135382.jpg", source: "Popular", rating: "7.8", episode: "13" },
  { id: 14, title: "Blue Lock", poster: "https://cdn.myanimelist.net/images/anime/1418/135035.jpg", source: "Popular", rating: "8.4", episode: "24" },
  { id: 15, title: "Chainsaw Man", poster: "https://cdn.myanimelist.net/images/anime/1806/126216.jpg", source: "Popular", rating: "8.6", episode: "12" },
  { id: 16, title: "Naruto: Shippuden", poster: "https://cdn.myanimelist.net/images/anime/1565/117573.jpg", source: "Popular", rating: "8.5", episode: "500" },
  { id: 17, title: "Dragon Ball Super", poster: "https://cdn.myanimelist.net/images/anime/1147/115271.jpg", source: "Popular", rating: "7.8", episode: "131" },
  { id: 18, title: "Death Note", poster: "https://cdn.myanimelist.net/images/anime/1079/123054.jpg", source: "Popular", rating: "8.8", episode: "37" },
  { id: 19, title: "Fullmetal Alchemist: Brotherhood", poster: "https://cdn.myanimelist.net/images/anime/1223/115931.jpg", source: "Popular", rating: "9.1", episode: "64" },
  { id: 20, title: "Your Lie in April", poster: "https://cdn.myanimelist.net/images/anime/1405/120329.jpg", source: "Popular", rating: "8.9", episode: "22" }
];

// Initialize APIs
const consumet = new ConsumetAPI();
const jikan = new JikanAPI();

// ============ API ENDPOINTS ============

// Get anime (with fallback)
app.get('/api/anime', async (req, res) => {
  const { type = 'recent', page = 1, q } = req.query;
  
  try {
    let result = null;
    
    if (q) {
      // Search
      result = await consumet.searchAnime(q, parseInt(page));
      if (!result.animes.length) {
        const jikanResult = await jikan.searchAnime(q, parseInt(page));
        if (jikanResult.animes.length) result = jikanResult;
      }
    } else if (type === 'trending') {
      result = await consumet.getTrendingAnime(parseInt(page));
    } else if (type === 'popular') {
      result = await consumet.getPopularAnime(parseInt(page));
    } else {
      result = await consumet.getRecentAnime(parseInt(page));
    }
    
    // If API returns empty, use fallback data
    if (!result.animes || result.animes.length === 0) {
      result = {
        animes: FALLBACK_ANIMES,
        isFallback: true
      };
    }
    
    res.json(result);
  } catch (error) {
    console.error('API Error:', error.message);
    // Return fallback data on error
    res.json({
      animes: FALLBACK_ANIMES,
      isFallback: true,
      error: error.message
    });
  }
});

// Get anime info
app.get('/api/anime/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    let info = await consumet.getAnimeInfo(id);
    
    if (!info) {
      // Return dummy info for fallback
      const fallbackAnime = FALLBACK_ANIMES.find(a => a.id == id);
      if (fallbackAnime) {
        info = {
          id: fallbackAnime.id,
          title: fallbackAnime.title,
          poster: fallbackAnime.poster,
          sinopsis: "Anime populer yang sedang trending. Detail lengkapnya bisa dilihat di MyAnimeList.",
          rating: fallbackAnime.rating,
          genres: ["Action", "Adventure", "Fantasy"],
          episodes: Array.from({ length: 12 }, (_, i) => ({
            episode: i + 1,
            title: `Episode ${i + 1}`,
            url: `/watch/${id}/episode/${i + 1}`
          }))
        };
      }
    }
    
    res.json(info || { error: 'Not found' });
  } catch (error) {
    res.json({ error: error.message });
  }
});

// Get episode stream
app.get('/api/stream/:id/:episode', async (req, res) => {
  const { id, episode } = req.params;
  
  try {
    const stream = await consumet.getEpisodeStream(id, episode);
    res.json(stream);
  } catch (error) {
    // Return dummy stream URL for fallback
    res.json({
      videos: [{
        url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
        quality: "720p"
      }]
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    endpoints: ['/api/anime', '/api/anime/:id', '/api/stream/:id/:episode']
  });
});

module.exports = app;

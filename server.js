const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ============ KURAMA API (Primary - Working) ============
class KuramaAPI {
  constructor() {
    this.baseURL = 'https://v8.kuramanime.tel';
    this.axios = axios.create({
      baseURL: this.baseURL,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      },
      timeout: 15000
    });
  }

  async getLatest(page = 1) {
    try {
      const response = await this.axios.get('/', { params: { page, need_json: true } });
      const data = response.data;
      const allAnimes = [
        ...(data.ongoingAnimes?.data || []),
        ...(data.finishedAnimes?.data || []),
        ...(data.movieAnimes?.data || [])
      ];
      
      return {
        animes: allAnimes.map(anime => ({
          id: anime.id,
          title: anime.title,
          poster: anime.poster,
          url: `${this.baseURL}/anime/${anime.id}/${anime.slug}`,
          source: 'Kurama',
          rating: anime.rating || 'N/A',
          episode: anime.latest_episode || '?'
        })),
        total: allAnimes.length
      };
    } catch (error) {
      console.error('Kurama error:', error.message);
      return { animes: [] };
    }
  }

  async search(query, page = 1) {
    try {
      const response = await this.axios.get('/anime', {
        params: { search: query, page, need_json: true }
      });
      const data = response.data;
      
      return {
        animes: (data.animes?.data || []).map(anime => ({
          id: anime.id,
          title: anime.title,
          poster: anime.poster,
          url: `${this.baseURL}/anime/${anime.id}/${anime.slug}`,
          source: 'Kurama',
          rating: anime.rating || 'N/A'
        })),
        hasNextPage: !!data.animes?.next_page_url
      };
    } catch (error) {
      console.error('Kurama search error:', error.message);
      return { animes: [] };
    }
  }

  async getDetail(url) {
    try {
      const response = await this.axios.get(url);
      const $ = cheerio.load(response.data);
      
      const title = $('.anime__details__title h3').text().trim();
      const poster = $('.anime__details__pic__mobile').attr('data-setbg');
      const sinopsis = $('#synopsisField').text().trim();
      const rating = $('.anime__details__pic__mobile .ep').text().trim();
      
      const episodes = [];
      const episodeContent = $('#episodeLists').attr('data-content');
      if (episodeContent) {
        const $eps = cheerio.load(episodeContent);
        $eps('.btn-danger').each((_, el) => {
          const epTitle = $eps(el).text().trim();
          const epUrl = $eps(el).attr('href');
          const epNum = parseInt(epTitle.replace(/\D/g, '')) || 0;
          episodes.push({ episode: epNum, title: epTitle, url: epUrl });
        });
        episodes.reverse();
      }
      
      const genres = [];
      $('.breadcrumb__links__v2__tags a').each((_, el) => {
        genres.push($(el).text().trim().replace(',', ''));
      });
      
      return { title, poster, sinopsis, rating, episodes, genres, source: 'Kurama' };
    } catch (error) {
      throw error;
    }
  }

  async getStream(epUrl) {
    try {
      const response = await this.axios.get(epUrl);
      const $ = cheerio.load(response.data);
      
      const videos = [];
      $('#player source').each((_, el) => {
        const src = $(el).attr('src');
        if (src) videos.push({ url: src, quality: $(el).attr('size') || 'Auto' });
      });
      
      return { videos, success: videos.length > 0 };
    } catch (error) {
      return { videos: [], success: false };
    }
  }
}

// ============ OTAKUDESU API (via MyAnimelist style) ============
class OtakudesuAPI {
  constructor() {
    this.baseURL = 'https://otakudesu.cloud';
  }

  async getLatest() {
    try {
      const response = await axios.get(`${this.baseURL}/ongoing-anime`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      const animes = [];
      
      $('.venz .jdlbar .detpost').each((_, el) => {
        const title = $(el).find('.jdl').text().trim();
        const poster = $(el).find('img').attr('src');
        const url = $(el).find('a').attr('href');
        const episode = $(el).find('.epz').text().trim();
        
        if (title) {
          animes.push({
            id: url?.split('/').filter(Boolean).pop(),
            title,
            poster,
            url,
            source: 'Otakudesu',
            episode
          });
        }
      });
      
      return { animes: animes.slice(0, 30) };
    } catch (error) {
      console.error('Otakudesu error:', error.message);
      return { animes: [] };
    }
  }

  async search(query) {
    try {
      const response = await axios.get(`${this.baseURL}?s=${encodeURIComponent(query)}&post_type=anime`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $ = cheerio.load(response.data);
      const animes = [];
      
      $('.chivsrc li').each((_, el) => {
        const title = $(el).find('h2 a').text().trim();
        const poster = $(el).find('img').attr('src');
        const url = $(el).find('a').attr('href');
        
        if (title) {
          animes.push({ title, poster, url, source: 'Otakudesu' });
        }
      });
      
      return { animes };
    } catch (error) {
      return { animes: [] };
    }
  }

  async getDetail(url) {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      const title = $('.infozingle h1').text().trim();
      const poster = $('.fotoanime img').attr('src');
      const sinopsis = $('.sinopc').text().trim();
      
      const episodes = [];
      $('.episodelist ul li').each((_, el) => {
        const epNum = $(el).find('strong a').text().trim();
        const epUrl = $(el).find('a').attr('href');
        if (epUrl) {
          episodes.push({ episode: epNum, url: epUrl });
        }
      });
      
      return { title, poster, sinopsis, episodes: episodes.reverse(), source: 'Otakudesu' };
    } catch (error) {
      throw error;
    }
  }

  async getStream(epUrl) {
    try {
      const response = await axios.get(epUrl);
      const $ = cheerio.load(response.data);
      let videoUrl = '';
      
      $('iframe').each((_, el) => {
        const src = $(el).attr('src');
        if (src && (src.includes('stream') || src.includes('video'))) {
          videoUrl = src;
        }
      });
      
      return { videos: videoUrl ? [{ url: videoUrl }] : [], success: !!videoUrl };
    } catch (error) {
      return { videos: [], success: false };
    }
  }
}

// ============ SAMEHADAKU API ============
class SamehadakuAPI {
  constructor() {
    this.baseURL = 'https://samehadaku.email';
  }

  async getLatest() {
    try {
      const response = await axios.get(this.baseURL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      const animes = [];
      
      $('.post').each((_, el) => {
        const title = $(el).find('.entry-title a').text().trim();
        const poster = $(el).find('img').attr('src');
        const url = $(el).find('.entry-title a').attr('href');
        
        if (title && url) {
          animes.push({ title, poster, url, source: 'Samehadaku' });
        }
      });
      
      return { animes: animes.slice(0, 20) };
    } catch (error) {
      console.error('Samehadaku error:', error.message);
      return { animes: [] };
    }
  }

  async search(query) {
    try {
      const response = await axios.get(`${this.baseURL}/?s=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });
      const $ = cheerio.load(response.data);
      const animes = [];
      
      $('.result-item').each((_, el) => {
        const title = $(el).find('h3 a').text().trim();
        const poster = $(el).find('img').attr('src');
        const url = $(el).find('a').attr('href');
        
        if (title) animes.push({ title, poster, url, source: 'Samehadaku' });
      });
      
      return { animes };
    } catch (error) {
      return { animes: [] };
    }
  }
}

// ============ ANOBOY API ============
class AnoboyAPI {
  constructor() {
    this.baseURL = 'https://anoboy.ch';
  }

  async getLatest() {
    try {
      const response = await axios.get(this.baseURL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      const animes = [];
      
      $('.entry').each((_, el) => {
        const title = $(el).find('.entry-title a').text().trim();
        const poster = $(el).find('img').attr('src');
        const url = $(el).find('.entry-title a').attr('href');
        
        if (title && title.toLowerCase().includes('anime')) {
          animes.push({ title, poster, url, source: 'Anoboy' });
        }
      });
      
      return { animes: animes.slice(0, 20) };
    } catch (error) {
      console.error('Anoboy error:', error.message);
      return { animes: [] };
    }
  }
}

// ============ KIRYUU API (Backup) ============
class KiryuuAPI {
  constructor() {
    this.baseURL = 'https://kiryuu.id';
  }

  async getLatest() {
    try {
      const response = await axios.get(this.baseURL, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      const animes = [];
      
      $('.list-anime .anime').each((_, el) => {
        const title = $(el).find('.title a').text().trim();
        const poster = $(el).find('img').attr('src');
        const url = $(el).find('.title a').attr('href');
        
        if (title) {
          animes.push({ title, poster, url, source: 'Kiryuu' });
        }
      });
      
      return { animes: animes.slice(0, 20) };
    } catch (error) {
      console.error('Kiryuu error:', error.message);
      return { animes: [] };
    }
  }
}

// Initialize APIs
const kurama = new KuramaAPI();
const otakudesu = new OtakudesuAPI();
const samehadaku = new SamehadakuAPI();
const anoboy = new AnoboyAPI();
const kiryuu = new KiryuuAPI();

// ============ API ENDPOINTS ============

// Get latest anime from all sources
app.get('/api/latest', async (req, res) => {
  try {
    const sources = await Promise.allSettled([
      kurama.getLatest(),
      otakudesu.getLatest(),
      samehadaku.getLatest(),
      anoboy.getLatest(),
      kiryuu.getLatest()
    ]);
    
    let allAnimes = [];
    sources.forEach(source => {
      if (source.status === 'fulfilled' && source.value.animes) {
        allAnimes.push(...source.value.animes);
      }
    });
    
    // Remove duplicates by title
    const uniqueAnimes = [];
    const titles = new Set();
    for (const anime of allAnimes) {
      const cleanTitle = anime.title.toLowerCase().trim();
      if (!titles.has(cleanTitle) && anime.title) {
        titles.add(cleanTitle);
        uniqueAnimes.push(anime);
      }
    }
    
    res.json({ 
      animes: uniqueAnimes.slice(0, 60),
      total: uniqueAnimes.length,
      sources: sources.filter(s => s.status === 'fulfilled' && s.value.animes?.length > 0).length
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search anime across all sources
app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json({ animes: [] });
  }
  
  try {
    const sources = await Promise.allSettled([
      kurama.search(q),
      otakudesu.search(q),
      samehadaku.search(q)
    ]);
    
    let allAnimes = [];
    sources.forEach(source => {
      if (source.status === 'fulfilled' && source.value.animes) {
        allAnimes.push(...source.value.animes);
      }
    });
    
    const uniqueAnimes = [];
    const titles = new Set();
    for (const anime of allAnimes) {
      const cleanTitle = anime.title.toLowerCase().trim();
      if (!titles.has(cleanTitle)) {
        titles.add(cleanTitle);
        uniqueAnimes.push(anime);
      }
    }
    
    res.json({ animes: uniqueAnimes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get anime detail (try all sources)
app.get('/api/detail', async (req, res) => {
  const { url, source } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  try {
    let detail = null;
    
    if (source === 'Kurama' || url.includes('kuramanime')) {
      detail = await kurama.getDetail(url);
    } else if (source === 'Otakudesu' || url.includes('otakudesu')) {
      detail = await otakudesu.getDetail(url);
    } else {
      // Try all sources
      try { detail = await kurama.getDetail(url); } catch(e) {}
      if (!detail) try { detail = await otakudesu.getDetail(url); } catch(e) {}
    }
    
    if (detail) {
      res.json(detail);
    } else {
      res.status(404).json({ error: 'Detail not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get stream URL
app.get('/api/stream', async (req, res) => {
  const { url, source } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL required' });
  }
  
  try {
    let stream = null;
    
    if (source === 'Kurama' || url.includes('kuramanime')) {
      stream = await kurama.getStream(url);
    } else if (source === 'Otakudesu' || url.includes('otakudesu')) {
      stream = await otakudesu.getStream(url);
    }
    
    if (stream && stream.success) {
      res.json(stream);
    } else {
      res.status(404).json({ error: 'Stream not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    sources: ['Kurama', 'Otakudesu', 'Samehadaku', 'Anoboy', 'Kiryuu'],
    timestamp: new Date().toISOString()
  });
});

module.exports = app;

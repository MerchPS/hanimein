const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ============ KURAMA API (Yang terbukti bekerja) ============
class KuramaAPI {
  constructor() {
    this.u = 'https://v8.kuramanime.tel';
    this.is = axios.create({
      baseURL: this.u,
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 16; NX729J) AppleWebKit/537.36',
        'origin': this.u,
        'referer': this.u,
      },
      timeout: 15000
    });
  }

  async ongoing(page = 1) {
    try {
      const response = await this.is.get('/', { 
        params: { page, need_json: true } 
      });
      
      const data = response.data;
      const animes = data.ongoingAnimes?.data || [];
      
      return {
        animes: animes.map(anime => ({
          id: anime.id,
          title: anime.title,
          poster: anime.poster,
          slug: anime.slug,
          url: `${this.u}/anime/${anime.id}/${anime.slug}`,
          episode: anime.latest_episode,
          rating: anime.rating
        })),
        hasNextPage: !!data.ongoingAnimes?.next_page_url,
        nextPage: data.ongoingAnimes?.next_page_url ? parseInt(page) + 1 : null
      };
    } catch (error) {
      console.error('[Kurama] Error:', error.message);
      return { animes: [], hasNextPage: false, nextPage: null };
    }
  }

  async search(query, page = 1) {
    try {
      const response = await this.is.get('/anime', {
        params: { search: query, page, need_json: true }
      });
      
      const data = response.data;
      const animes = data.animes?.data || [];
      
      return {
        animes: animes.map(anime => ({
          id: anime.id,
          title: anime.title,
          poster: anime.poster,
          slug: anime.slug,
          url: `${this.u}/anime/${anime.id}/${anime.slug}`,
          rating: anime.rating
        })),
        hasNextPage: !!data.animes?.next_page_url,
        nextPage: data.animes?.next_page_url ? parseInt(page) + 1 : null
      };
    } catch (error) {
      console.error('[Kurama] Search error:', error.message);
      return { animes: [], hasNextPage: false, nextPage: null };
    }
  }

  async getByType(type, page = 1) {
    try {
      const response = await this.is.get('/', { 
        params: { page, need_json: true } 
      });
      
      const data = response.data;
      let animes = [];
      
      if (type === 'ongoing') animes = data.ongoingAnimes?.data || [];
      else if (type === 'finished') animes = data.finishedAnimes?.data || [];
      else if (type === 'movie') animes = data.movieAnimes?.data || [];
      
      return {
        animes: animes.map(anime => ({
          id: anime.id,
          title: anime.title,
          poster: anime.poster,
          slug: anime.slug,
          url: `${this.u}/anime/${anime.id}/${anime.slug}`
        })),
        hasNextPage: false,
        nextPage: null
      };
    } catch (error) {
      console.error('[Kurama] Error:', error.message);
      return { animes: [], hasNextPage: false, nextPage: null };
    }
  }

  async detail(url) {
    try {
      const response = await this.is.get(url);
      const $ = cheerio.load(response.data);
      
      const title = $('.anime__details__title h3').text().trim();
      const alternativeTitle = $('.anime__details__title span').text().trim();
      const poster = $('.anime__details__pic__mobile').attr('data-setbg');
      const sinopsis = $('#synopsisField').text().trim();
      const rating = $('.anime__details__pic__mobile .ep').text().trim();
      const animeId = $('input#animeId').attr('value');
      
      // Get details like genre, status, etc.
      const details = {};
      $('.anime__details__widget ul li .row').each((_, el) => {
        const label = $(el).find('.col-3 span').text().replace(/:/, '').toLowerCase();
        const value = $(el).find('.col-9').text().trim();
        if (label) details[label] = value;
      });
      
      // Get episodes
      const episodes = [];
      const episodeContent = $('#episodeLists').attr('data-content');
      if (episodeContent) {
        const $eps = cheerio.load(episodeContent);
        $eps('.btn-danger').each((_, el) => {
          const epTitle = $eps(el).text().trim();
          const epUrl = $eps(el).attr('href');
          const epNum = parseInt(epTitle.replace(/\D/g, '')) || 0;
          episodes.push({ 
            episode: epNum, 
            title: epTitle, 
            url: epUrl,
            number: epNum
          });
        });
        episodes.reverse();
      }
      
      // Get related anime
      const related = [];
      $('.anime__details__review .breadcrumb__links__v2 div a').each((_, el) => {
        const title = $(el).text().slice(2).trim();
        const url = $(el).attr('href');
        if (title && url) related.push({ title, url });
      });
      
      // Get tags
      const tags = [];
      $('#tagSection .breadcrumb__links__v2__tags a').each((_, el) => {
        tags.push($(el).text().trim().replace(',', ''));
      });
      
      return { 
        id: animeId, 
        title, 
        alternativeTitle,
        poster, 
        sinopsis, 
        rating,
        details,
        episodes,
        related,
        tags
      };
    } catch (error) {
      console.error('[Kurama] Detail error:', error.message);
      throw error;
    }
  }

  async getEpisodeStream(epUrl) {
    try {
      const response = await this.is.get(epUrl);
      const $ = cheerio.load(response.data);
      
      // Get video sources
      const videos = [];
      $('#player source').each((_, el) => {
        const src = $(el).attr('src');
        const size = $(el).attr('size') || 'Auto';
        if (src) videos.push({ quality: size, url: src });
      });
      
      // Get download links if any
      const downloads = [];
      $('#animeDownloadLink').find('h6').each((_, el) => {
        const type = $(el).text().trim();
        const links = [];
        let next = $(el).next();
        while (next.length && !next.is('h6')) {
          if (next.is('a')) {
            links.push({
              name: next.text().trim(),
              url: next.attr('href')
            });
          }
          next = next.next();
        }
        if (links.length) downloads.push({ type, links });
      });
      
      return {
        videos,
        downloads,
        title: $('title').text()
      };
    } catch (error) {
      console.error('[Kurama] Stream error:', error.message);
      return { videos: [], downloads: [] };
    }
  }

  async getSchedule(day, page = 1) {
    try {
      const response = await this.is.get('/schedule', {
        params: { scheduled_day: day, page, need_json: true }
      });
      
      const data = response.data;
      const animes = data.animes?.data || [];
      
      return {
        animes: animes.map(anime => ({
          id: anime.id,
          title: anime.title,
          poster: anime.poster,
          url: `${this.u}/anime/${anime.id}/${anime.slug}`,
          time: anime.time
        })),
        hasNextPage: !!data.animes?.next_page_url,
        nextPage: data.animes?.next_page_url ? parseInt(page) + 1 : null
      };
    } catch (error) {
      console.error('[Kurama] Schedule error:', error.message);
      return { animes: [], hasNextPage: false, nextPage: null };
    }
  }
}

const kurama = new KuramaAPI();

// ============ API ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    source: 'Kurama',
    timestamp: new Date().toISOString() 
  });
});

// Ongoing anime
app.get('/api/ongoing', async (req, res) => {
  const { page = 1 } = req.query;
  const result = await kurama.ongoing(parseInt(page));
  res.json(result);
});

// Search anime
app.get('/api/search', async (req, res) => {
  const { q, page = 1 } = req.query;
  if (!q) {
    return res.json({ animes: [], hasNextPage: false, nextPage: null });
  }
  const result = await kurama.search(q, parseInt(page));
  res.json(result);
});

// Get by type (ongoing, finished, movie)
app.get('/api/:type', async (req, res) => {
  const { type } = req.params;
  const { page = 1 } = req.query;
  const result = await kurama.getByType(type, parseInt(page));
  res.json(result);
});

// Anime detail
app.get('/api/detail', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }
  try {
    const result = await kurama.detail(url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Episode stream
app.get('/api/stream', async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'URL parameter required' });
  }
  try {
    const result = await kurama.getEpisodeStream(url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule
app.get('/api/schedule', async (req, res) => {
  const { day, page = 1 } = req.query;
  if (!day) {
    return res.status(400).json({ error: 'Day parameter required (senin, selasa, etc.)' });
  }
  const result = await kurama.getSchedule(day, parseInt(page));
  res.json(result);
});

// Export for Vercel
module.exports = app;

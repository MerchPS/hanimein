const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ============ KURAMA API ============
class KuramaAPI {
  constructor() {
    this.u = 'https://v8.kuramanime.tel';
    this.is = axios.create({
      baseURL: this.u,
      headers: {
        'user-agent': 'Mozilla/5.0 (Linux; Android 16; NX729J) AppleWebKit/537.36',
        'origin': this.u,
        'referer': this.u,
      }
    });
  }

  async search(query, page = 1) {
    const f = await this.is.get(`/anime`, {
      params: { order_by: "latest", search: query, page, need_json: true }
    });
    return {
      animes: f.data.animes.data.map(p => ({
        id: p.id,
        title: p.title,
        poster: p.poster,
        slug: p.slug,
        url: `${this.u}/anime/${p.id}/${p.slug}`
      })),
      hasNextPage: !!f.data.animes.next_page_url,
      nextPage: f.data.animes.next_page_url?.split('page=')[1]
    };
  }

  async ongoing(page = 1) {
    const f = await this.is.get('/', { params: { page, need_json: true } });
    return {
      animes: f.data.ongoingAnimes.data.map(p => ({
        id: p.id, title: p.title, poster: p.poster, slug: p.slug,
        url: `${this.u}/anime/${p.id}/${p.slug}`
      })),
      hasNextPage: !!f.data.ongoingAnimes.next_page_url,
      nextPage: f.data.ongoingAnimes.next_page_url?.split('page=')[1]
    };
  }

  async detail(url) {
    const wb = await this.is.get(url);
    const $ = cheerio.load(wb.data);
    
    const animeId = $('input#animeId').attr('value');
    const title = $('.anime__details__title h3').text().trim();
    const poster = $('.anime__details__pic__mobile').attr('data-setbg');
    const sinopsis = $('#synopsisField').text().trim();
    
    const strEps = cheerio.load($('#episodeLists').attr('data-content') || '');
    const episodes = [];
    strEps('.btn-danger').each((_, el) => {
      episodes.push({
        episode: parseInt($(el).text().replace(/\D/g, '')) || 0,
        title: $(el).text().trim(),
        url: $(el).attr('href')
      });
    });
    episodes.reverse();
    
    return { id: animeId, title, poster, sinopsis, episodes, sourceUrl: url };
  }

  async episodeStream(epUrl) {
    const t = await this.is.get(epUrl);
    const $ = cheerio.load(t.data);
    const sources = [];
    $('#player source').each((_, el) => {
      sources.push({ quality: $(el).attr('size'), url: $(el).attr('src') });
    });
    return sources.length > 0 ? sources[0].url : null;
  }
}

// ============ MOBINIME API ============
class MobinimeAPI {
  constructor() {
    this.inst = axios.create({
      baseURL: 'https://air.vunime.my.id/mobinime',
      headers: {
        'accept-encoding': 'gzip',
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        'user-agent': 'Dart/3.3 (dart:io)',
        'x-api-key': 'ThWmZq4t7w!z%C*F-JaNdRgUkXn2r5u8'
      }
    });
  }

  async search(query, page = 0) {
    const { data } = await this.inst.post('/anime/search', {
      perpage: '20',
      startpage: page.toString(),
      q: query
    });
    return {
      animes: (data.data || []).map(a => ({
        id: a.id, title: a.title, poster: a.poster
      })),
      nextPage: data.nextpage ? page + 1 : null
    };
  }

  async ongoing(page = 0) {
    return this.search('', page);
  }

  async detail(id) {
    const { data } = await this.inst.post('/anime/detail', { id: id.toString() });
    const info = data.data;
    const episodes = (info.episode || []).map(ep => ({
      episode: ep.episode,
      title: ep.name,
      id: ep.id
    }));
    return {
      id: info.id, title: info.title, poster: info.poster,
      sinopsis: info.sinopsis, episodes
    };
  }

  async stream(animeId, epsId, quality = 'HD') {
    const { data: srv } = await this.inst.post('/anime/get-server-list', {
      id: epsId.toString(),
      animeId: animeId.toString(),
      jenisAnime: '1',
      userId: ''
    });
    const { data } = await this.inst.post('/anime/get-url-video', {
      url: srv.serverurl,
      quality: quality,
      position: '0'
    });
    return data.url;
  }
}

// ============ ANIMEIN API ============
class AnimeinAPI {
  constructor() {
    this.baseUrl = 'https://animeinweb.com';
  }

  async request(url) {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
        'Referer': this.baseUrl
      }
    });
    return res.data?.data;
  }

  async search(keyword, page = 0) {
    const data = await this.request(
      `${this.baseUrl}/api/proxy/3/2/explore/movie?page=${page}&sort=views&keyword=${encodeURIComponent(keyword)}`
    );
    return {
      animes: (data || []).map(m => ({
        id: m.id, title: m.title, poster: m.poster
      })),
      nextPage: data?.next_page_url ? page + 1 : null
    };
  }

  async ongoing(page = 0) {
    return this.search('', page);
  }

  async detail(id) {
    const detail = await this.request(`${this.baseUrl}/api/proxy/3/2/movie/detail/${id}`);
    const episodesData = await this.request(`${this.baseUrl}/api/proxy/3/2/movie/episode/${id}?page=0`);
    const episodes = (episodesData?.episode || []).map(ep => ({
      episode: ep.episode,
      title: ep.title,
      id: ep.id
    }));
    return {
      id: detail.id, title: detail.title, poster: detail.poster,
      sinopsis: detail.sinopsis, episodes
    };
  }

  async stream(episodeId) {
    const data = await this.request(`${this.baseUrl}/api/proxy/3/2/episode/streamnew/${episodeId}`);
    return data?.url;
  }
}

// Inisialisasi API
const kurama = new KuramaAPI();
const mobinime = new MobinimeAPI();
const animein = new AnimeinAPI();

// ============ ENDPOINTS ============
app.get('/api/:source/search', async (req, res) => {
  try {
    const { source } = req.params;
    const { q, page = 1 } = req.query;
    let result;
    
    if (source === 'kurama') result = await kurama.search(q, parseInt(page));
    else if (source === 'mobinime') result = await mobinime.search(q, parseInt(page) - 1);
    else result = await animein.search(q, parseInt(page) - 1);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:source/ongoing', async (req, res) => {
  try {
    const { source } = req.params;
    const { page = 1 } = req.query;
    let result;
    
    if (source === 'kurama') result = await kurama.ongoing(parseInt(page));
    else if (source === 'mobinime') result = await mobinime.ongoing(parseInt(page) - 1);
    else result = await animein.ongoing(parseInt(page) - 1);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:source/detail', async (req, res) => {
  try {
    const { source } = req.params;
    const { id, url } = req.query;
    let result;
    
    if (source === 'kurama') result = await kurama.detail(url);
    else if (source === 'mobinime') result = await mobinime.detail(id);
    else result = await animein.detail(id);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/:source/stream', async (req, res) => {
  try {
    const { source } = req.params;
    const { animeId, epsId, epUrl } = req.query;
    let streamUrl;
    
    if (source === 'kurama') streamUrl = await kurama.episodeStream(epUrl);
    else if (source === 'mobinime') streamUrl = await mobinime.stream(animeId, epsId);
    else streamUrl = await animein.stream(epsId);
    
    res.json({ streamUrl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

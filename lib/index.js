const HTTPS = require('https');
const PATH = require('path');
const OS = require('os');
const FS = require('fs');

const USERNAME = 'xxx';
const PASSWORD = 'xxx';
const AUTH = Buffer.from(USERNAME + ':' + PASSWORD, 'utf8').toString('base64');

const UTIL = require('./util.js');
const OUT = PATH.resolve(__dirname, '../out/');
if(!FS.existsSync(OUT)) FS.mkdirSync(OUT);

const BASE_URL = 'https://restrictedsenses.com/main/updates/';

const fetchPage = (currPage = 1) => new Promise((resolve, reject) => {
  let req_url = BASE_URL;
  if(currPage !== 1) req_url += `page/${currPage}/`

  HTTPS.get(req_url, (resp) => {
    if(resp.statusCode !== 200) return reject(new Error('failed request'));

    const body = [];
    resp.on('data', chunk => body.push(chunk));
    resp.on('end', () => {
      const resp_string = Buffer.concat(body).toString();
      // parse meta
      const pageNums = UTIL.between(resp_string, '<div class="wp-pagenavi">', '</div>');
      const pages = pageNums.split('<a').splice(1).map(a => UTIL.between(a, '>', '</a>')).filter(a => a.match(/^[0-9]+$/));
      const highestPage = Number(pages.sort((a,b) => Number(b) - Number(a))[0]);

      // parse content
      const container = UTIL.between(resp_string, '<div class="row" id="blog" >', '<div class="clear">');
      const videos = container.split('<div class="pin-article').splice(1);
      const parsedVideos = videos.map(vid => parseVideo(vid, currPage));

      if(currPage < highestPage) {
        return fetchPage(currPage + 1).then(nextPageVideo => {
          return resolve([].concat(parsedVideos, nextPageVideo));
        }).catch(reject);
      }
      return resolve(parsedVideos);
    })
  });
});

const VID_REGEX = /\(([0-9]{1,2}(:[0-9]{1,2})?)\s*(mins?\s*)?((?:\/|&#8211;)\s*(([0-9]+\.)?[0-9]+(GB|MB)))?\)/;
const parseVideo = (string, page) => {
  const title_holder = UTIL.between(string, '<h1 class="title">', '</h1>');
  const entry_info = UTIL.between(string, '<div class="entry-info"', '</div>');
  const gallery = UTIL.between(string, '<div class=\'gallery\'>', '</div>').split('<dt').splice(1);
  const media = string.split('<h4').splice(1).filter(a => a.includes('/main/members/') && !a.includes('<video'));
  const video_media = media.find(a => a.toLowerCase().includes('video'));
  const image_media = media.find(a => a.toLowerCase().includes('images'));

  const video_match = !video_media ? null : video_media.match(VID_REGEX);

  return {
    headerImage: UTIL.between(string, '<img src="', '"'),
    ref: UTIL.between(title_holder, '<a href="', '"'),
    page: page,
    title: UTIL.removeHtml(UTIL.between(title_holder, '">', '</a>')),
    title_escaped: UTIL.removeHtml(UTIL.between(title_holder, '">', '</a>')).replace(/\s+/g, '-'),
    date: UTIL.between(entry_info, '<i class="icon-time" ></i>', '</span>'),
    type: UTIL.between(entry_info, '<i class="icon-camera"></i>', '</span>'),
    preview: gallery.map(a => {
      let adaptive = UTIL.between(a, 'srcset="', '"').split(', ').sort((a,b) => {
        return Number(UTIL.between(b, ' ', 'w')) - Number(UTIL.between(a, ' ', 'w'));
      })[0].split(' ')[0];
      let fallback = UTIL.between(a, 'src="', '"');
      return adaptive || fallback;
    }),
    description: UTIL.removeHtml(UTIL.between(string, '<p style="text-align: center;">', '</p>')),
    video: !video_media ? null : {
      link: UTIL.between(video_media, 'href="', '"').replace('http:', 'https:'),
      length: video_match[1] || null,
      size: video_match[5] || null,
    },
    images: !image_media ? null : {
      link: UTIL.between(image_media, 'href="', '"').replace('http:', 'https:'),
      count: Number(UTIL.between(image_media, '</a> (', 'images)')),
    }
  }
}

fetchPage().then(resp => {
  const total = resp.length;
  const q = resp;

  const doubs = UTIL.findDoubs(resp);
  for(const doub of doubs) {
    console.log(`-- folder conflict: ${doub.first.title}@${doub.first.page} and ${doub.second.title}@${doub.second.page}`)
  }

  const work = () => {
    const video = q.pop();
    if(!video) return;
    console.log(`-- starting worker on ${total - q.length} of ${total} = "${video.title}"`);
    const DIR = PATH.resolve(OUT + '/', video.title_escaped);

    if(FS.existsSync(DIR)) return work();

    const vid = PATH.join(OS.tmpdir(), 'vid-' + Date.now());
    const img = PATH.join(OS.tmpdir(), 'img-' + Date.now());

    Promise.all([
      download(video.video ? video.video.link : null, vid),
      download(video.images ? video.images.link : null, img),
    ]).then(() => {
      FS.mkdirSync(DIR);
      if(video.video && video.video.link) FS.renameSync(vid, PATH.resolve(DIR, PATH.basename(video.video.link)));
      if(video.images && video.images.link) FS.renameSync(img, PATH.resolve(DIR, PATH.basename(video.images.link)));
      FS.writeFileSync(PATH.resolve(DIR, 'meta.json'), JSON.stringify(video, null, 2))

      work();
    }).catch(err => {
      console.error(`"${video.title}" on page ${video.page} failed: ${err}`);
      work();
    });
  }
  work();
});

const download = (url, file) => new Promise((resolve, reject) => {
  console.log(`${new Date().toISOString()} - downloading ${url} to ${file}`);
  if(!url) return resolve();
  HTTPS.get(url, {
    headers: { Authorization: 'Basic ' + AUTH }
  }, (resp) => {
    if(resp.statusCode !== 200) return reject(new Error('statusCode '+resp.statusCode));
    resp.pipe(FS.createWriteStream(file));
    resp.on('end', resolve)
  });
});

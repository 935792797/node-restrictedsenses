const ENTITIES = require('html-entities').AllHtmlEntities;

exports.between = (haystack, left, right) => {
  let pos;
  pos = haystack.indexOf(left);
  if (pos === -1) { return ''; }
  haystack = haystack.slice(pos + left.length);
  if (!right) { return haystack; }
  pos = haystack.indexOf(right);
  if (pos === -1) { return ''; }
  haystack = haystack.slice(0, pos);
  return haystack;
};

exports.removeHtml = string => new ENTITIES().decode(
  string.replace(/\n/g, ' ')
    .replace(/\s*<\s*br\s*\/?\s*>\s*/gi, '\n')
    .replace(/<\s*\/\s*p\s*>\s*<\s*p[^>]*>/gi, '\n')
    .replace(/<.*?>/gi, ''),
).trim();

exports.findDoubs = videos => {
  const doubs = [];
  for(let i = 0 ; i < videos.length ; i++) {
    for(let j = 0 ; j < videos.length ; j++) {
      if(i === j) continue;

      if(videos[i].title_escaped === videos[j].title_escaped) {
        doubs.push({
          first: videos[i],
          second: videos[j],
        });
      }
    }
  }
  return doubs;
}

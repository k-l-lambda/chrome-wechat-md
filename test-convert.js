/**
 * Test script for markdown to HTML conversion
 * Usage: node test-convert.js
 */

const fs = require('fs');
const path = require('path');

// Load marked.js
const { marked } = require('marked');

// Read the test markdown file
const mdPath = 'C:\\Users\\kllam\\documents\\wechat-articles\\lilylet\\main.md';
const markdown = fs.readFileSync(mdPath, 'utf-8');

console.log('=== Input Markdown (first 500 chars) ===');
console.log(markdown.substring(0, 500));
console.log('\n');

// Configure marked options (same as publisher.js)
marked.setOptions({
  breaks: true,
  gfm: true,
  headerIds: false,
  mangle: false
});

// Convert markdown to HTML
let html = marked.parse(markdown);

console.log('=== Raw HTML from marked.js (first 2000 chars) ===');
console.log(html.substring(0, 2000));
console.log('\n');

// Apply list cleanup (same as publisher.js)
html = html
  .replace(/<li>\s*<p>([\s\S]*?)<\/p>\s*<\/li>/gi, '<li>$1</li>')
  .replace(/<li>\s*<\/li>/g, '')
  .replace(/<li>\s*<br\s*\/?>\s*<\/li>/g, '')
  .replace(/<li>(\s*<br\s*\/?>\s*)+/g, '<li>')
  .replace(/(\s*<br\s*\/?>\s*)+<\/li>/g, '</li>')
  .replace(/<li>([\s\S]*?)<\/li>/gi, (_, content) => {
    return '<li>' + content.replace(/\n/g, ' ').trim() + '</li>';
  });

console.log('=== After list cleanup (first 2000 chars) ===');
console.log(html.substring(0, 2000));
console.log('\n');

// Find and show all links
const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
const links = [];
let match;
while ((match = linkRegex.exec(html)) !== null) {
  links.push({ url: match[1], text: match[2] });
}

console.log('=== Found Links ===');
links.forEach((link, i) => {
  console.log(`${i + 1}. "${link.text}" -> ${link.url}`);
});
console.log('\n');

// Find and show all list items
const listItemRegex = /<li>([\s\S]*?)<\/li>/gi;
const listItems = [];
while ((match = listItemRegex.exec(html)) !== null) {
  listItems.push(match[1].substring(0, 100));
}

console.log('=== Found List Items ===');
listItems.forEach((item, i) => {
  console.log(`${i + 1}. ${item}...`);
});
console.log('\n');

// Save raw HTML
const outputPath = path.join(__dirname, 'test-output.html');
fs.writeFileSync(outputPath, html);
console.log(`=== Raw HTML saved to: ${outputPath} ===`);

// Now simulate inlineCSS() - convert lists to sections
const { JSDOM } = require('jsdom');
const dom = new JSDOM(html);
const container = dom.window.document.body;

// Convert ul to sections with bullets
container.querySelectorAll('ul').forEach(ul => {
  const section = dom.window.document.createElement('section');
  section.style.cssText = 'margin: 10px 0; padding-left: 0;';

  ul.querySelectorAll(':scope > li').forEach(li => {
    const p = dom.window.document.createElement('p');
    p.style.cssText = 'margin: 5px 0; line-height: 1.75; color: #3f3f3f; padding-left: 1.5em; text-indent: -1.5em;';
    p.innerHTML = '• ' + li.innerHTML;
    section.appendChild(p);
  });

  ul.replaceWith(section);
});

// Convert ol to sections with numbers
container.querySelectorAll('ol').forEach(ol => {
  const section = dom.window.document.createElement('section');
  section.style.cssText = 'margin: 10px 0; padding-left: 0;';

  ol.querySelectorAll(':scope > li').forEach((li, index) => {
    const p = dom.window.document.createElement('p');
    p.style.cssText = 'margin: 5px 0; line-height: 1.75; color: #3f3f3f; padding-left: 1.5em; text-indent: -1.5em;';
    p.innerHTML = `${index + 1}. ` + li.innerHTML;
    section.appendChild(p);
  });

  ol.replaceWith(section);
});

// Style links
container.querySelectorAll('a').forEach(el => {
  el.style.cssText = 'color: #0366d6; text-decoration: none;';
});

const finalHtml = container.innerHTML;

// Save final HTML
const finalPath = path.join(__dirname, 'test-output-final.html');
fs.writeFileSync(finalPath, finalHtml);
console.log(`=== Final HTML (after inlineCSS) saved to: ${finalPath} ===`);

// Show a sample of the final HTML
console.log('\n=== Final HTML sample (first 2000 chars) ===');
console.log(finalHtml.substring(0, 2000));

import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

const PUBLIC = new URL('../public/', import.meta.url);
const pages = readdirSync(PUBLIC).filter((file) => file.endsWith('.html'));

/**
 * Mirrors `cleanUrls` in vercel.json: `/` serves index.html and `/plan` serves plan.html.
 * @param {string} pathname
 */
function fileFor(pathname) {
  const path = pathname.slice(1) || 'index';
  return new URL(path.includes('.') ? path : `${path}.html`, PUBLIC);
}

for (const page of pages) {
  describe(page, () => {
    const html = readFileSync(new URL(page, PUBLIC), 'utf8');
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
    const urls = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((match) => match[1]);

    it('links only to pages, files and anchors that exist', () => {
      for (const url of urls.filter((value) => !/^[a-z]+:/i.test(value))) {
        if (url.startsWith('#')) {
          assert.ok(ids.has(url.slice(1)), `no element with id for ${url}`);
          continue;
        }
        const { pathname } = new URL(url, 'https://event-planner.local/');
        assert.ok(existsSync(fileFor(pathname)), `no file serves ${url}`);
      }
    });

    // The CSP in vercel.json allows only same-origin scripts, styles and images, and nothing inline.
    it('loads nothing the Content-Security-Policy would block', () => {
      assert.doesNotMatch(html, /\ssrc="(?:https?:)?\/\//, 'third-party src');
      assert.doesNotMatch(html, /<link[^>]*\shref="(?:https?:)?\/\//, 'third-party stylesheet or font');
      assert.doesNotMatch(html, /\sstyle="/, 'inline style attribute');
      assert.doesNotMatch(html, /<style[\s>]/, 'inline style block');
      assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/, 'inline script');
    });

    it('declares a language and has exactly one h1', () => {
      assert.match(html, /<html lang="[a-z]{2}">/);
      assert.equal(html.match(/<h1[\s>]/g)?.length, 1);
    });
  });
}

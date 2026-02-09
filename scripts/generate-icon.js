#!/usr/bin/env node
/**
 * Prepare app icons from rss_reader_lens_transparent_iconset.zip (at project root).
 * - Unzips to build/rss_reader_lens_transparent.iconset/
 * - On macOS: creates build/icon.icns via iconutil
 * - Copies icon_512x512.png to build/icon.png (Windows/Linux and fallback)
 * Run: npm run icon
 */
const { execSync } = require('child_process')
const { copyFileSync, existsSync, mkdirSync } = require('fs')
const { join } = require('path')

const root = join(__dirname, '..')
const zipPath = join(root, 'rss_reader_lens_transparent_iconset.zip')
const buildDir = join(root, 'build')
const iconsetDir = join(buildDir, 'rss_reader_lens_transparent.iconset')
const iconPng = join(buildDir, 'icon.png')
const iconIcns = join(buildDir, 'icon.icns')

if (!existsSync(zipPath)) {
  console.error('Missing rss_reader_lens_transparent_iconset.zip at project root.')
  process.exit(1)
}

if (!existsSync(buildDir)) mkdirSync(buildDir, { recursive: true })

console.log('Unzipping iconset...')
execSync(`unzip -o "${zipPath}" -d "${buildDir}"`, { stdio: 'inherit' })

console.log('Copying icon_512x512.png to build/icon.png')
copyFileSync(join(iconsetDir, 'icon_512x512.png'), iconPng)

if (process.platform === 'darwin') {
  console.log('Creating build/icon.icns (macOS)...')
  execSync(`iconutil -c icns "${iconsetDir}" -o "${iconIcns}"`, { stdio: 'inherit' })
  console.log('Done. build/icon.icns and build/icon.png ready.')
} else {
  console.log('Done. build/icon.png ready (use on macOS after running iconutil there for .icns).')
}

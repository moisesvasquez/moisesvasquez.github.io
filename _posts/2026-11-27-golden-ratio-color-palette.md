---
layout: post
title: "Golden Ratio Color Palette"
date: 2026-11-27 09:00:00 -0500
image: /assets/images/projects/golden-ratio-color-palette.jpg
permalink: /blog/golden-ratio-color-palette
description: "Enter one hex color and get an accent, complementary and contrast color worked out with the golden ratio, with the math behind each one."
brief: "Type in one hex color and get a full palette built on the golden ratio: an accent, a complementary and a contrast color, each with the math shown. Test the combinations on sample text and copy any color or the whole list."
category: Design
type: Web App
link: /golden-ratio-color-palette/
tags: blog-post design javascript project
---

[The Golden Ratio Color Palette](/golden-ratio-color-palette/) turns one color into a four-color palette using φ, the golden ratio (1.618).

The method comes from Harry Salce's video ["Golden Ratio for color"](https://www.instagram.com/reel/DgF3iQBRcXG/). Follow him at [@harr.ysalce](https://www.instagram.com/harr.ysalce/). I wanted a tool that did the math for any color instead of working it out by hand each time.

**How it works**

Everything is done in HSB (hue, saturation, brightness), the numbers you see in a design tool's color picker.

- **Accent:** subtract the golden angle, 137.5°, from the hue (360 − 360 ÷ 1.618), and take that hue at saturation 100 and brightness 95.
- **Complementary:** keep the hue, bring the saturation down 61.8% and raise the brightness 38.2% of the way to 100.
- **Contrast:** keep the hue and saturation and multiply the brightness by 0.382.

Starting from the video's example, #00B2A9, you get #F29F00, #80CFCB and #004541.

**What it does**

Each color shows the calculation behind it, so you can see where it came from. There's a text test with a few color pairings and their WCAG contrast ratios, and you can copy any single color, the whole list as comma-separated hex codes, or CSS variables.

The background is the "hat", the einstein tile discovered in 2023: a single shape that tiles the plane without ever repeating. It's redrawn in your palette every time you change the color, with the contrast color as the lines.

---
layout: post
title: "146 Years of US Baby Names"
date: 2026-10-17 09:00:00 -0400
image: /assets/images/projects/us-baby-names.jpg
permalink: /blog/us-baby-names
description: "A name lookup tool built on 146 years of Social Security data. Search any name, compare trends, and see how naming in America has changed."
brief: "Search 146 years of US baby name data from the SSA. Look up any name, compare trends, and explore what parents have been picking lately."
category: Data
type: Web App
link: https://names.moisesvasquez.io
github: https://github.com/moisesvasquez/us-baby-names
tags: blog-post data javascript project
---

I built [names.moisesvasquez.io](https://names.moisesvasquez.io) because I kept getting annoyed at existing baby name sites. They all buried the actual data behind clutter, ads, and "popularity scores" with no source attached. I wanted something that just showed you the numbers.

The dataset comes straight from the Social Security Administration. Every name given to at least five US babies in a given year, from 1880 through 2025. That's 375 million babies and 105,966 different names.

**What it does**

Type any name in the search box and you get its full history: how many babies received it each year, its peak year and highest rank ever, and a rough estimate of how old the people walking around with that name are today. The age estimate uses birth counts adjusted against a US life table, which makes it a lot more useful than just "this name peaked in 1987."

There's also a compare tab if you want to put two names side by side, and a "Last 5 years" section that shows what's actually been happening with naming since 2021.

A few things in that data genuinely surprised me. The top-100 concentration has dropped from 53% of all babies in 1996 to 35% in 2025. Parents are spreading out across far more names than they were a generation ago. At the same time, 31,227 distinct names were recorded in 2025 alone.

The Yellowstone effect is real and measurable. Kayce went from 85 babies in 2020 to 843 in 2025. Colter jumped from 221 to 2,354. Those are cowboy names from the Dutton ranch saga, and the timing lines up exactly with the show's peak years.

Alexa has been falling hard since Amazon's assistant showed up everywhere. Down 81% from 2020. Kobe spiked in 2020 as a memorial tribute and has been dropping since, which is the typical shape of those booms.

**The API**

The whole dataset is also available as a free API. If you want to pull name data into your own project, you can query by name, by year range, or by rank. No key required.

The source code is [on GitHub](https://github.com/moisesvasquez/us-baby-names).

---

Built with vanilla JavaScript and hosted on Cloudflare Pages. No framework, no build step. The dataset fits in a single compressed file that loads once and stays in memory, which keeps every query instant.

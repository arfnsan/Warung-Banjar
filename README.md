# Warban – Warung Masakan Banjar

A responsive, single-page landing website for **Warban**, a Banjar cuisine restaurant (*warung*) in Banjarmasin, South Kalimantan. It showcases the menu, restaurant story, chefs, opening hours, customer reviews, and includes reservation and contact forms.

The site is written in plain HTML, CSS and JavaScript. There is no build step and no backend, so you can open `index.html` in a browser and it works.

> **Language:** the website content is in Indonesian (`<html lang="id">`).

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [Page Sections](#page-sections)
- [Menu Items](#menu-items)
- [Customization Guide](#customization-guide)
- [JavaScript Overview](#javascript-overview)
- [Known Issues](#known-issues)
- [Possible Improvements](#possible-improvements)
- [Credits & Licenses](#credits--licenses)

---

## Features

- **Responsive layout** built on Bootstrap 5.3 (desktop, tablet, mobile)
- **Sticky navigation** with scroll-spy (the active link follows the section in view) and a collapsing mobile menu
- **Search overlay** with category shortcuts and "most searched" tags
- **Menu grid with category filtering** (Main Dishes, Fish, Rice & Sides, Soups, Traditional Cakes)
- **Menu detail popup** showing image, price, rating, calories, prep time, tags and a quantity selector
- **Favorite (heart) toggle** on menu cards
- **Gallery lightbox** with previous/next navigation
- **Testimonial slider** (Swiper, autoplay, 1 / 2 / 3 slides depending on screen width)
- **Promo countdown timer** for the discount banner
- **Reservation, contact and newsletter forms** (front-end only, see [Known Issues](#known-issues))
- **Scroll animations** (AOS), "back to top" button, smooth scrolling, `Esc` key closes any open popup
- **YouTube story video** link in the hero section

---

## Tech Stack

| Purpose | Library / Tool | Version |
|---|---|---|
| Layout & components | [Bootstrap](https://getbootstrap.com/) | 5.3.8 |
| DOM / plugins | [jQuery](https://jquery.com/) | 3.7.1 |
| Scroll animations | [AOS](https://michalsnik.github.io/aos/) | bundled |
| Slider | [Swiper](https://swiperjs.com/) | 11.2.10 |
| Video / iframe popup | [Magnific Popup](https://dimsemenov.com/plugins/magnific-popup/) | 1.1.0 |
| Icons | Font Awesome (`css/all.min.css`, `webfonts/`) | 6.0.0 Pro |
| Icons (extra) | IcoMoon (`webfonts/icomoon.*`) | – |
| Fonts | Google Fonts: Playfair Display, Poppins, Dancing Script | loaded via CDN |

All libraries are stored locally in `css/` and `js/`, except Google Fonts, which needs an internet connection.

---

## Project Structure

```
Warung-Banjar/
├── index.html          # The entire page (all sections, popups, forms)
├── css/
│   ├── style.css       # Custom styles and theme variables (main file to edit)
│   ├── bootstrap.min.css
│   ├── aos.css
│   ├── swiper-bundle.min.css
│   ├── magnific-popup.css
│   └── all.min.css     # Font Awesome
├── js/
│   ├── main.js         # All custom site behavior (main file to edit)
│   ├── jquery-3.7.1.min.js
│   ├── bootstrap.bundle.min.js
│   ├── bootstrap.min.js
│   ├── aos.js
│   ├── swiper-bundle.min.js
│   └── jquery.magnific-popup.min.js
├── img/
│   ├── banner-img.jpg, off-img.jpg, about1.jpg, about2.jpg
│   ├── category/       # Category card images (1–6)
│   ├── menu/           # Menu photos (1–10)
│   ├── portfolio/      # Gallery images (work1–work5)
│   ├── blog/           # History section images (1–3)
│   ├── chefs/          # Chef photos (cewe.jpg, cowo.jpg)
│   └── testimonial/    # Customer avatars (1–4)
└── webfonts/           # Font Awesome and IcoMoon font files
```

---

## Getting Started

### Option 1: Open directly

1. Clone or download the repository:
   ```bash
   git clone https://github.com/arfnsan/Warung-Banjar.git
   cd Warung-Banjar
   ```
2. Double-click `index.html` to open it in your browser.

### Option 2: Run a local server (recommended)

```bash
# Python 3
python -m http.server 8000

# or Node.js
npx serve .
```

Then visit `http://localhost:8000`.

### Deploying

Because the site is fully static, it can be hosted anywhere that serves files, for example **GitHub Pages**, Netlify, Vercel or any shared hosting. For GitHub Pages: *Settings → Pages → Deploy from branch → `main` / root*.

---

## Page Sections

Sections are anchored by `id` and linked from the navbar.

| Section ID | Content |
|---|---|
| `topbar` | Phone, email, address, promo tag, social media icons |
| `nav` | Logo, menu links, search button, "Pesan Sekarang!" button |
| `searchOv` | Full-screen search overlay with category shortcuts |
| `hero` | Headline, call-to-action buttons, YouTube story link |
| `category` | Category cards that filter the menu |
| `about` | About the restaurant ("Tentang Kami") |
| `menu` | Filterable menu grid (`#mgrid`) and detail popup (`#menuPop`) |
| `special` | Discount banner with countdown timer |
| `gallery` | Image gallery with lightbox (`#galPop`) |
| `history` | History of Warban |
| `chefs` | Chef profiles |
| `hours` | Opening hours, online ordering note, location details |
| `testimonials` | Customer reviews slider |
| `reservation` | Table reservation form |
| `newsletter` | Email subscription box |
| `contact-section` | Contact details and message form |
| `footer` | Footer links and information |

---

## Menu Items

| Item | Category | Price |
|---|---|---|
| Soto Banjar | Hidangan Berkuah (Soups) | Rp25.000 |
| Ikan Patin Baubar | Hidangan Ikan (Fish) | Rp32.000 |
| Nasi Kuning Banjar | Nasi & Lauk (Rice & Sides) | Rp22.000 |
| Ayam Masak Habang | Masakan Utama (Main Dishes) | Rp28.000 |
| Iwak Karing Betanak | Hidangan Ikan (Fish) | Rp25.000 |
| Gangan Asam Banjar | Hidangan Berkuah (Soups) | Rp24.000 |
| Lontong Banjar | Hidangan Berkuah (Soups) | Rp20.000 |
| Bingka | Kue Tradisional (Traditional Cakes) | Rp15.000 |
| Pais Patin | Hidangan Ikan (Fish) | Rp30.000 |

Category filter keys used in the code: `all`, `utama`, `ikan`, `nasi`, `kuah`, `kue`.

---

## Customization Guide

### Change colors and theme

Edit the CSS variables at the top of `css/style.css`:

```css
:root {
  --primary: #e8281a;    /* main red */
  --secondary: #f6a623;  /* accent orange */
  --dark: #1a1a1a;
  --green: #2d6a4f;
  --cream: #fff8f0;
  --cream2: #fef0dc;
  --light: #f9f5f0;
}
```

### Add or edit a menu item

Menu cards live in `index.html` inside `<div class="row g-4" id="mgrid">`. Copy an existing `.mwrap` block and update it:

```html
<div class="col-sm-6 col-lg-4 mwrap" data-c="kuah" data-aos="fade-up">
  <div class="mcard"
       data-img="img/menu/2.jpg"
       data-title="Soto Banjar"
       data-cat="Hidangan Berkuah"
       data-price="Rp25.000"
       data-old="Rp30.000"
       data-rating="4.9"
       data-ulasan="128"
       data-cal="320"
       data-time="12"
       data-desc="Description shown in the popup."
       data-tags="Khas Banjar,Hangat,Terlaris">
    ...
  </div>
</div>
```

- `data-c` on `.mwrap` must be one of `utama`, `ikan`, `nasi`, `kuah`, `kue` for filtering to work.
- The `data-*` attributes on `.mcard` feed the detail popup.
- Remember to also update the visible text inside the card (title, short description, price).

### Update contact details and opening hours

Search `index.html` for the phone number (`+62 808-5410-098`), email (`warban@gmail.com`) and address (`Kayu Tangi II`). They appear in the top bar, `hours`, `contact-section` and the footer.

### Replace images

Replace files in `img/` using the **same file names**, or update the `src` / `data-img` / `data-gimg` paths in `index.html`.

### Social media and video links

- Social icons in the top bar and footer currently use `href="#"`. Replace them with real profile URLs.
- The hero video button points to a YouTube URL; change the `href` on the `.btn-play` link.

### Countdown timer

The promo timer starts from hard-coded values in `js/main.js` (`cH = 8, cM = 45, cS = 30`) and resets to 8 hours when it ends. Change these values or replace them with a real end date.

---

## JavaScript Overview

All custom logic is in `js/main.js` (plus a small inline script in `index.html` for hero smooth scrolling).

| Feature | Key functions / selectors |
|---|---|
| Animations | `AOS.init({ duration: 680, once: true, offset: 55 })` |
| Navbar scroll state, scroll-spy, back-to-top | `window` scroll listener |
| Smooth scroll and mobile menu auto-close | `a[href^="#"]` click handlers |
| Search overlay | `#searchOv`, `closeSearch()` |
| Menu filtering | `filterMenu(cat)`, `.filtbtn`, `.catcard` |
| Menu detail popup | `openMenuPop(card)`, `closeMenuPop()` |
| Gallery lightbox | `openGal(i)`, `closeGal()`, `.gitem` |
| Testimonials slider | `new Swiper('.tesSwiper', {...})` |
| Countdown timer | `setInterval` updating `#cdH`, `#cdM`, `#cdS` |
| Forms | `#resBtn`, `#ctcBtn`, `#nlBtn` click handlers |
| Keyboard | `Esc` closes search, menu popup, gallery and video popup |

---

## Known Issues

These were found while reviewing the code and are worth fixing:

1. **"Add to Cart" throws a JavaScript error.** `main.js` updates an element with id `cartCount`, but the floating cart widget is commented out in `index.html` (around line 1773). Either uncomment the widget or remove the cart logic.
2. **Review count is not displayed in the popup.** The JS reads `data-reviews`, but the menu cards use `data-ulasan`. Rename one so they match.
3. **Mixed languages in the UI.** Some popup and button texts are in English ("Add to Cart", "Calories", "Prep Time", "Booking...", "Send Message") while the rest of the site is Indonesian.
4. **Garbled characters in `main.js`.** A couple of symbols (for example the empty-star character and an arrow in a comment) appear as `â˜†` / `â†’`, which suggests a file-encoding mismatch. Save the file as UTF-8.
5. **Forms do not send data.** The reservation, contact and newsletter buttons only simulate a 1.5-second "loading" and show a success message. Nothing is submitted anywhere, and there is no validation beyond basic HTML `required`.
6. **Search input does nothing.** Typing in the search box does not filter results; only the category shortcuts work.
7. **Opening hours are inconsistent.** The `hours` section lists different times per weekday (and closed on weekends), while the contact section says "Senin – Minggu, 09.00 – 22.00 WIB".
8. **Placeholder links.** Social media links use `#`.
9. **Font Awesome licence.** The bundled `css/all.min.css` header identifies **Font Awesome Pro 6.0.0 (commercial licence)**. See [Credits & Licenses](#credits--licenses).

---

## Possible Improvements

- Connect forms to a backend or a service (Formspree, EmailJS, Google Forms, WhatsApp link, etc.)
- Implement a real cart and an ordering flow (for example sending the order to WhatsApp)
- Make the search box filter menu items live
- Add an embedded Google Map for the Kayu Tangi II location
- Add SEO and sharing metadata (Open Graph tags, favicon) and image `alt` text for every image
- Compress images (WebP) and remove unused Bootstrap/Font Awesome files for faster loading
- Split the large `index.html` into reusable partials if the site grows

---

## Credits & Licenses

- **Author:** Sarab (per the `<meta name="author">` tag) · Repository owner: [@arfnsan](https://github.com/arfnsan)
- **Libraries:** Bootstrap (MIT), jQuery (MIT), AOS (MIT), Swiper (MIT), Magnific Popup (MIT), Google Fonts (OFL / Apache 2.0)
- **Font Awesome:** the included build is labelled *Pro*, which requires a paid licence. If you do not hold one, switch to [Font Awesome Free](https://fontawesome.com/download) before publishing.
- **Images:** make sure you have the rights to all photos in `img/` before using the site commercially.
- **Project license:** no license file is currently included. Add a `LICENSE` file (for example MIT) if you want others to reuse the code.

---

*Last updated: October 2026*

<div align="center">

# split-bill

*Split a restaurant bill fairly: shared plates, service charge, tax, and discounts. Runs in your browser.*

![license](https://img.shields.io/badge/license-MIT-0d1117?style=for-the-badge&labelColor=161b22)
![backend](https://img.shields.io/badge/backend-none-0d1117?style=for-the-badge&labelColor=161b22)

![screenshot](screenshot.png)

</div>

## Features

- Assign each item to one person, several people, or everyone
- Service charge, tax, and discount, shared in proportion to what each person ordered
- Optional rounding, and a "paid by" setting that shows who owes whom
- Copy a summary to paste into any chat
- 11 currencies, light and dark mode, works on phones
- No account, no server, no tracking. Your data stays on your device

## Usage

Open the live page, or download this repo and open `index.html`. Add people, add items, tap who shared each one, and fill in the extras from your receipt.

## How it is calculated

1. Each item is divided equally among the people selected for it.
2. The discount is subtracted, then service charge is added, then tax (optionally on top of the service charge).
3. Each of these is shared in proportion to each person's item total.

Shares always add up exactly to the bill. If rounding is on, the group pays slightly more, and the difference is shown.

## Contributing

Issues and pull requests are welcome. Please keep it dependency-free: plain HTML, CSS, and JavaScript.

## License

MIT

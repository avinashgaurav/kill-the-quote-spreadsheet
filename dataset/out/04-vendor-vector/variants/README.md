# Photo stress set

Five photographs of the same printed rate card. Same 22 line items, same
prices, same ground truth in `../99-internal/ground-truth.json`.

`v2_moderate` is the canonical demo input and is identical to
`../04-vendor-vector/IMG_20260917_1142_vector_rate_card.jpg`.

These exist to produce an accuracy-vs-condition curve rather than a single
number from a single favourable input. Extraction accuracy is expected to
fall from easy to very hard. The requirement is not that it stays high; the
requirement is that reported confidence falls with it, and that lines the
model cannot read are returned as unreadable rather than guessed.

A run where accuracy drops and confidence does not is a failing run, even
if the headline accuracy looks acceptable.

| file | difficulty | condition |
|---|---|---|
| `v1_flat_bright.jpg` | easy | Flat on a desk, good light, slight angle |
| `v2_moderate.jpg` | moderate | Handheld, off-axis, one overhead lamp (CANONICAL DEMO INPUT) |
| `v3_curled_thumb.jpg` | hard | Curled page, thumb over the bottom-left corner |
| `v4_lowlight_motion.jpg` | very hard | Low light, handheld motion blur, warm tungsten |
| `v5_steep_angle.jpg` | very hard | Steep angle, strong keystone, screen-side glare |

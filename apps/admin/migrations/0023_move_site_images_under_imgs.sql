UPDATE homepage_config
SET hero_image_url = 'imgs/site/homepage/' || substr(hero_image_url, length('home/') + 1)
WHERE hero_image_url LIKE 'home/%'
  AND hero_image_url NOT LIKE 'home/special-pages/%';

UPDATE special_pages
SET hero_image_url = replace(hero_image_url, 'home/special-pages/', 'imgs/special-pages/'),
    card_image_url = replace(card_image_url, 'home/special-pages/', 'imgs/special-pages/')
WHERE hero_image_url LIKE 'home/special-pages/%'
   OR card_image_url LIKE 'home/special-pages/%';

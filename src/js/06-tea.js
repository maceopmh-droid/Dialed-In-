        // ===================== v17.0: tea =====================
        // Coffee stays the main thing; tea is a real second option. A tea is a coffee item with kind 'tea' (saved as such
        // on the backend: coffees.kind / tea_type), its company is its brand (the same roaster field), and a tea session uses
        // the tea methods below. Only tea: no herbal tisanes or other drinks.
        const TEA_TYPES = ['Green', 'White', 'Yellow', 'Oolong', 'Black', 'Pu-erh', 'Matcha'];
        // what each type usually wants (°C, and a western-style steep in seconds): placeholders and the next-steep advice
        const TEA_TYPE_INFO = {
            Green: { temp: 78, steep: 120, color: '#7FA45B' }, White: { temp: 85, steep: 180, color: '#C9B98F' },
            Yellow: { temp: 78, steep: 150, color: '#D2B04C' }, Oolong: { temp: 92, steep: 180, color: '#B98A4B' },
            Black: { temp: 95, steep: 210, color: '#9A4F3A' }, 'Pu-erh': { temp: 98, steep: 150, color: '#6E4A3A' },
            Matcha: { temp: 75, steep: 0, color: '#6E9E3F' }
        };
        // the tea methods (same form as coffee: leaf goes where the dose goes, water where the yield goes)
        const TEA_METHOD_PROFILES = {
            'Western': { dose: 'Leaf (g)', yld: 'Water (ml)', time: 'Steep (s)', ratio: 80, extras: ['teabag', 'temp', 'steeps'], recipes: false, tea: true, hint: 'Teapot, mug or infuser' },
            'Gongfu': { dose: 'Leaf (g)', yld: 'Water (ml)', time: 'Steep (s)', ratio: 18, extras: ['temp', 'rinse', 'steeps'], recipes: false, tea: true, hint: 'Gaiwan or small pot, many short steeps' },
            'Matcha': { dose: 'Matcha (g)', yld: 'Water (ml)', time: 'Whisk (s)', ratio: 35, extras: ['style', 'milk', 'temp'], recipes: false, tea: true, hint: 'Whisked' },
            'Cold Steep': { dose: 'Leaf (g)', yld: 'Water (ml)', time: 'Steep (hours)', ratio: 100, extras: [], recipes: false, tea: true, hours: true, hint: 'Steeped cold in the fridge' }
        };
        Object.assign(METHOD_PROFILES, TEA_METHOD_PROFILES);
        const TEA_METHODS = Object.keys(TEA_METHOD_PROFILES);
        // matcha is powder, so it's only ever whisked; leaf teas are steeped (a tea with no type set gets all four)
        const LEAF_TEA_METHODS = ['Western', 'Gongfu', 'Cold Steep'];
        // how a matcha is made: thin (the everyday bowl), thick (twice the powder, little water), or with milk.
        // ratio: water to powder (a latte's is the matcha shot before the milk)
        const MATCHA_STYLES = [
            { key: 'usucha', label: 'Thin (usucha)', short: 'Usucha', ratio: 35, usual: '2 g in 70 ml · 75°C' },
            { key: 'koicha', label: 'Thick (koicha)', short: 'Koicha', ratio: 10, usual: '4 g in 40 ml · 75°C' },
            { key: 'latte', label: 'Latte', short: 'Latte', ratio: 30, milk: true, usual: '2 g in 60 ml, then 150 ml milk' },
            { key: 'iced', label: 'Iced latte', short: 'Iced latte', ratio: 30, milk: true, usual: '2 g in 60 ml, then 150 ml cold milk over ice' }
        ];
        const COFFEE_METHODS = ['Espresso', 'Pour Over', 'French Press', 'Moka Pot', 'Aeropress', 'Cold Brew'];
        // the six sliders keep their places (and storage keys); tea reads them in tea words. Acidity's place is astringency.
        const TEA_TASTE_META = [
            ['acidity', 'Astringency', ['Soft', 'Some grip', 'Drying']],
            ['sweetness', 'Sweetness', ['Dry', 'Sweet', 'Honeyed']],
            ['body', 'Body', ['Thin', 'Medium', 'Thick']],
            ['finish', 'Finish', ['Short', 'Clean', 'Lingering']],
            ['bitterness', 'Bitterness', ['Clean', 'Noticeable', 'Harsh']],
            ['balance', 'Complexity', ['Simple', 'Some depth', 'Layered']]
        ];
        // the tea flavor wheel: same shape as the coffee one, the last family is "tastes off"
        const TEA_WHEEL = [
            { fam: 'Floral', color: '#A06F98', groups: [['Blossom', ['Jasmine', 'Orchid', 'Osmanthus', 'Rose', 'Honeysuckle']], ['Fresh flowers', ['Lilac', 'Gardenia', 'Magnolia']]] },
            { fam: 'Fruity', color: '#B65A57', groups: [['Stone fruit', ['Peach', 'Apricot', 'Plum']], ['Citrus', ['Lemon', 'Bergamot', 'Yuzu']], ['Tropical', ['Lychee', 'Mango', 'Muscatel']], ['Orchard', ['Apple', 'Pear', 'Grape']], ['Dried fruit', ['Raisin', 'Date', 'Fig']]] },
            { fam: 'Vegetal', color: '#6F9A52', groups: [['Green', ['Fresh grass', 'Spinach', 'Sweet pea', 'Bamboo']], ['Marine', ['Seaweed', 'Nori', 'Umami']], ['Dry', ['Hay', 'Straw', 'Artichoke']]] },
            { fam: 'Sweet', color: '#B98A2E', groups: [['Sugars', ['Honey', 'Malt', 'Caramel', 'Brown sugar']], ['Confection', ['Vanilla', 'Cocoa', 'Molasses']]] },
            { fam: 'Nutty & toasty', color: '#85604A', groups: [['Nuts', ['Chestnut', 'Almond', 'Walnut']], ['Toasted', ['Toasted rice', 'Biscuit', 'Roasted grain', 'Bread']]] },
            { fam: 'Spice & wood', color: '#A2643A', groups: [['Spice', ['Cinnamon', 'Clove', 'Black pepper', 'Ginger']], ['Wood', ['Cedar', 'Sandalwood', 'Camphor']]] },
            { fam: 'Earthy & smoky', color: '#6B5A4E', groups: [['Earthy', ['Wet earth', 'Forest floor', 'Mushroom', 'Leather']], ['Smoky', ['Pine smoke', 'Charcoal', 'Tobacco']], ['Mineral', ['Wet stone', 'Slate', 'Salty']]] },
            { fam: 'Tastes off', color: '#7D8984', groups: [['Over-steeped', ['Bitter', 'Harsh', 'Drying', 'Stewed']], ['Under-steeped', ['Thin', 'Watery', 'Flat']], ['Stale', ['Papery', 'Musty', 'Dusty']]] }
        ];

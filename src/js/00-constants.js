        const NOTE_WHEEL = [
            { fam: 'Fruity', color: '#B65A57', groups: [['Berry', ['Blueberry', 'Raspberry', 'Strawberry', 'Blackberry', 'Blackcurrant']], ['Citrus', ['Lemon', 'Lime', 'Orange', 'Grapefruit', 'Bergamot']], ['Stone fruit', ['Peach', 'Apricot', 'Cherry', 'Plum']], ['Tropical', ['Mango', 'Pineapple', 'Passion fruit', 'Lychee']], ['Dried fruit', ['Raisin', 'Date', 'Fig', 'Prune']], ['Orchard', ['Apple', 'Pear', 'Grape']]] },
            { fam: 'Floral', color: '#A06F98', groups: [['Blossom', ['Jasmine', 'Rose', 'Orange blossom', 'Lavender']], ['Tea', ['Black tea', 'Earl Grey', 'Chamomile', 'Hibiscus']]] },
            { fam: 'Sweet', color: '#B98A2E', groups: [['Sugars', ['Brown sugar', 'Caramel', 'Honey', 'Maple', 'Molasses']], ['Confection', ['Vanilla', 'Toffee', 'Marshmallow', 'Candy']]] },
            { fam: 'Nutty & cocoa', color: '#85604A', groups: [['Nuts', ['Almond', 'Hazelnut', 'Peanut', 'Walnut']], ['Cocoa', ['Milk chocolate', 'Dark chocolate', 'Cocoa nib']]] },
            { fam: 'Spice', color: '#A2643A', groups: [['Warm spice', ['Cinnamon', 'Clove', 'Nutmeg', 'Cardamom']], ['Savory', ['Black pepper', 'Anise', 'Ginger']]] },
            { fam: 'Roasted & earthy', color: '#6B5A4E', groups: [['Grain', ['Malt', 'Toast', 'Cereal']], ['Smoky', ['Tobacco', 'Smoke', 'Cedar']], ['Earthy', ['Earthy', 'Forest floor', 'Mushroom']]] },
            { fam: 'Fermented', color: '#7C5C85', groups: [['Winey', ['Red wine', 'Rum', 'Whiskey']], ['Funky', ['Fermented fruit', 'Yogurt', 'Boozy']]] },
            { fam: 'Tastes off', color: '#7D8984', groups: [['Under-extracted', ['Sour', 'Sharp', 'Salty', 'Grassy', 'Thin']], ['Over-extracted', ['Bitter', 'Harsh', 'Ashy', 'Drying', 'Burnt']], ['Stale', ['Papery', 'Woody', 'Flat']]] }
        ];
        // the 15 original descriptors land on the wheel too, so older sessions light it up
        const LEGACY_NOTES = { berry: ['Fruity', 'Berry'], citrus: ['Fruity', 'Citrus'], 'stone fruit': ['Fruity', 'Stone fruit'], 'dried fruit': ['Fruity', 'Dried fruit'], floral: ['Floral', ''], chocolate: ['Nutty & cocoa', 'Cocoa'], cocoa: ['Nutty & cocoa', 'Cocoa'], nutty: ['Nutty & cocoa', 'Nuts'], spice: ['Spice', ''], caramel: ['Sweet', 'Sugars'], honey: ['Sweet', 'Sugars'], vanilla: ['Sweet', 'Confection'], tobacco: ['Roasted & earthy', 'Smoky'], earthy: ['Roasted & earthy', 'Earthy'], jasmine: ['Floral', 'Blossom'], bergamot: ['Fruity', 'Citrus'] };
        const TASTE_META = [
            ['acidity', 'Acidity', ['Flat', 'Balanced', 'Bright']],
            ['sweetness', 'Sweetness', ['Dry', 'Sweet', 'Syrupy']],
            ['body', 'Body', ['Thin', 'Medium', 'Heavy']],
            ['finish', 'Finish', ['Short', 'Clean', 'Lingering']],
            ['bitterness', 'Bitterness', ['Clean', 'Noticeable', 'Harsh']],
            ['balance', 'Complexity', ['Simple', 'Some depth', 'Layered']]
        ];
        const TASTE_KEYS = TASTE_META.map(m => m[0]);
        const INITIAL_SEL = '.feed-avatar, .cmt-avatar, .person-dot, .hero-avatar, .aw-face, .cq-face b, .thread-faces i, .wr-face, .wr-who b, .mrc-face, .dh-faces i';

        // ---- per-method logging (v11): same form, labels and extras change with the method
        const METHOD_PROFILES = {
            'Espresso': { dose: 'Dose (g)', yld: 'Pull (g)', time: 'Time (s)', ratio: 2, extras: [], recipes: false },
            'Pour Over': { dose: 'Dose (g)', yld: 'Water (g)', time: 'Total time (s)', ratio: 16, extras: ['brewer', 'temp'], recipes: true },
            'French Press': { dose: 'Dose (g)', yld: 'Water (g)', time: 'Total time (s)', ratio: 16, extras: ['temp'], recipes: true },
            'Aeropress': { dose: 'Dose (g)', yld: 'Water (g)', time: 'Total time (s)', ratio: 15, extras: ['temp', 'inverted'], recipes: true },
            'Moka Pot': { dose: 'Dose (g)', yld: 'Water (g)', time: 'Time (s)', ratio: 9, extras: ['heat', 'preheated'], recipes: true },
            'Cold Brew': { dose: 'Dose (g)', yld: 'Water (g)', time: 'Steep (hours)', ratio: 8, extras: [], recipes: true, hours: true }
        };
        const STEP_KINDS = {
            pour: { label: 'Pour', color: '#4F86D9' }, wait: { label: 'Wait', color: '#8A958C' }, swirl: { label: 'Swirl', color: '#D9A03A' },
            stir: { label: 'Stir', color: '#D9A03A' }, drawdown: { label: 'Drawdown', color: '#3E8F62' }, steep: { label: 'Steep', color: '#8A63C4' },
            press: { label: 'Press', color: '#A0663F' }
        };
        // s = how much of the total water should be in by the end of a pour (so recipes scale with the water)
        const BUILTIN_RECIPES = [
            { id: 'hoffmann-1cup', name: 'Hoffmann 1-cup V60', method: 'Pour Over', brewer: 'V60', dose: 15, water: 250, temp: 96, credit: 'Based on James Hoffmann\'s 1-cup V60 technique', steps: [
                { k: 'pour', d: 10, s: 0.2, n: 'Bloom: wet all the grounds' }, { k: 'swirl', d: 5, n: 'Gently, until evenly wet' }, { k: 'wait', d: 30, n: 'Let the bloom breathe' },
                { k: 'pour', d: 15, s: 0.4 }, { k: 'wait', d: 10 }, { k: 'pour', d: 10, s: 0.6 }, { k: 'wait', d: 10 }, { k: 'pour', d: 10, s: 0.8 }, { k: 'wait', d: 10 },
                { k: 'pour', d: 10, s: 1 }, { k: 'swirl', d: 5, n: 'Gently, to flatten the bed' }, { k: 'drawdown', d: 55, n: 'Hands off, let it drain' }] },
            { id: 'hoffmann-ultimate', name: 'Hoffmann Ultimate V60', method: 'Pour Over', brewer: 'V60', dose: 30, water: 500, temp: 96, credit: 'Based on James Hoffmann\'s Ultimate V60 technique', steps: [
                { k: 'pour', d: 10, s: 0.12, n: 'Bloom: about twice the coffee weight' }, { k: 'swirl', d: 10, n: 'Until there are no dry clumps' }, { k: 'wait', d: 25, n: 'Let the bloom breathe' },
                { k: 'pour', d: 30, s: 0.6, n: 'Steady, circular pour' }, { k: 'pour', d: 30, s: 1, n: 'Slower now, to the top' }, { k: 'stir', d: 5, n: 'One gentle stir around the edge' },
                { k: 'swirl', d: 5, n: 'Gently, to flatten the bed' }, { k: 'drawdown', d: 95, n: 'Hands off, let it drain' }] },
            { id: 'kasuya-46', name: '4:6 method', method: 'Pour Over', brewer: 'V60', dose: 20, water: 300, temp: 93, credit: 'Based on Tetsu Kasuya\'s 4:6 method', steps: [
                { k: 'pour', d: 10, s: 0.2, n: 'First 40% sets the sweetness' }, { k: 'wait', d: 35 }, { k: 'pour', d: 10, s: 0.4 }, { k: 'wait', d: 35 },
                { k: 'pour', d: 10, s: 0.6, n: 'Last 60% sets the strength' }, { k: 'wait', d: 35 }, { k: 'pour', d: 10, s: 0.8 }, { k: 'wait', d: 35 }, { k: 'pour', d: 10, s: 1 }, { k: 'drawdown', d: 50 }] },
            { id: 'press-classic', name: 'Classic French press', method: 'French Press', dose: 30, water: 500, temp: 96, credit: 'A long, clean steep', steps: [
                { k: 'pour', d: 20, s: 1, n: 'All the water in' }, { k: 'steep', d: 220, n: 'Lid on, don\'t touch it' }, { k: 'stir', d: 20, n: 'Break the crust, skim the foam' },
                { k: 'wait', d: 300, n: 'Let the fines settle' }, { k: 'press', d: 15, n: 'Plunger just to the surface, then pour' }] },
            { id: 'aero-standard', name: 'Everyday AeroPress', method: 'Aeropress', dose: 15, water: 225, temp: 90, credit: 'Simple and forgiving', steps: [
                { k: 'pour', d: 10, s: 1, n: 'All the water in' }, { k: 'stir', d: 10, n: 'A few stirs' }, { k: 'steep', d: 100, n: 'Cap on, wait' }, { k: 'press', d: 30, n: 'Press slow and steady' }] },
            { id: 'moka-classic', name: 'Classic moka pot', method: 'Moka Pot', dose: 18, water: 160, credit: 'Hot water in the base, medium-low heat', steps: [] },
            { id: 'cold-classic', name: 'Overnight cold brew', method: 'Cold Brew', dose: 100, water: 800, credit: 'Concentrate: dilute 1:1 to drink', steps: [] }
        ];


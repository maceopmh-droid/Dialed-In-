        // Learn (v19.0): what kind of coffee a coffee is, read from the words on its bag. Plain functions, no DOM: the app,
        // the tests and the server's backfill (supabase/learn_tags.js) all use this same code.
        //   LearnEngine.read(bean)              -> tags: variety ids, origin (countries, region, place, blend), process
        //                                          (one base plus layers; decaf and grade on their own), roast, notes
        //   LearnEngine.field(kind, text, ctx)  -> what one form field says, for the chips under it as you type
        //   LearnEngine.decode(bean)            -> the plain-words sentence about the bag (the one decode, C1/C2/L1)
        //   LearnEngine.store(bean)             -> the small copy the server keeps for community numbers
        // Every phrase the decode uses has a source (SRC below); the pages themselves live in learn/*.json.
        const LearnEngine = (() => {
            const VERSION = 1;
            const fold = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
            // "SL-28", "S.L. 28" and "sl 28" all read as "sl28"; "Murang'a" as "muranga"
            const norm = s => fold(s).toLowerCase().replace(/['’`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
            const squash = s => norm(s).replace(/ /g, '');
            const SPLIT = /,|\/|&|\+|;|\band\b|\by\b(?= [A-Za-z])|\bwith\b/i;

            // ---- sources for the phrases the decode says (pages carry their own)
            const SRC = {
                'wcr-caturra': 'https://varieties.worldcoffeeresearch.org/varieties/caturra',
                'wcr-geisha': 'https://varieties.worldcoffeeresearch.org/varieties/geisha-panama',
                'wcr-sl28': 'https://varieties.worldcoffeeresearch.org/varieties/sl28',
                'wcr-sl34': 'https://varieties.worldcoffeeresearch.org/varieties/sl34',
                'wcr-bourbon': 'https://varieties.worldcoffeeresearch.org/varieties/bourbon',
                'wcr-typica': 'https://varieties.worldcoffeeresearch.org/varieties/typica',
                'wcr-catuai': 'https://varieties.worldcoffeeresearch.org/varieties/catuai',
                'wcr-pacamara': 'https://varieties.worldcoffeeresearch.org/varieties/pacamara',
                'wcr-batian': 'https://varieties.worldcoffeeresearch.org/varieties/batian',
                'wcr-java': 'https://varieties.worldcoffeeresearch.org/varieties/java',
                'gcr-castillo': 'https://www.gcrmag.com/the-fnc-weighs-in-on-the-castillo-vs-caturra-debate',
                'jcc-colombia': 'https://japanesecoffeeco.com/blogs/japanese-coffee-blog/7-different-arabica-varieties-that-are-cultivated-in-colombia',
                'cafeimports-pink': 'https://www.cafeimports.com/north-america/blog/?p=52997',
                'sucafina-glossary': 'https://sucafina.com/na/About/glossary',
                'roasterspack-heirloom': 'https://theroasterspack.com/blogs/news/lets-talk-about-heirloom-varietals-of-ethiopia',
                'gimme-process': 'https://gimmecoffee.com/blogs/news/coffee-processing-washed-natural-honey-wet-hulled-whats-the-difference',
                'cafeimports-anaerobic': 'https://www.cafeimports.com/europe/blog/wp-json/wp/v2/posts/43422',
                'barista-double': 'https://baristamagazine.com/understanding-the-process-double-fermentation',
                'rave-cm': 'https://ravecoffee.co.uk/blogs/news/a-short-history-of-carbonic-maceration',
                'pdg-lactic': 'https://perfectdailygrind.com/2023/10/lactic-fermentation-coffee-roasters/',
                'ineffable-ts': 'https://ineffablecoffee.com/en/blogs/learning-coffee-culture/thermal-shock-coffee',
                'pdg-infused': 'https://perfectdailygrind.com/2024/09/infused-coffee-world-barista-championship/',
                'royalny-decaf': 'https://www.royalny.com/?p=148617',
                'koa-swp': 'https://koacoffee.com/learn-about-coffee/decaf-the-swiss-water-process-and-why-we-use-it',
                'coffeereview-anaerobic': 'https://www.coffeereview.com/anaerobically-processed-coffees/',
                'achilles-grades': 'https://achillescoffeeroasters.com/blogs/specialty-coffee-blog/coffee-grades-explained-what-shb-shg-ep-kenya-aa-excelso-and-supremo-mean',
                'wiki-arabica': 'https://en.wikipedia.org/wiki/Coffea_arabica',
                'twochimps-grades': 'https://twochimpscoffee.com/blogs/the-grades-of-coffee/'
            };

            // ---- varieties: id | name | family | other names (";") | flags (q = DNA evidence early or second-hand)
            // Families follow DNA where it's known (World Coffee Research's groups), not the name on the bag.
            const FAMILY = { landrace: 'Ethiopian landrace', yemen: 'Yemeni', typica: 'Typica family', bourbon: 'Bourbon family', cross: 'Typica × Bourbon', introgressed: 'Timor Hybrid line', f1: 'F1 hybrid', species: 'Species' };
            const VARIETIES = `
ethiopian-landrace|Ethiopian landrace|landrace|heirloom;ethiopian heirloom;heirloom varieties;ethiopia heirloom;landrace;landraces;ethiopian landrace;ethiopian landraces;local landraces;regional landraces;indigenous;indigenous heirloom;jarc varieties;jarc selections;jarc
74110|74110|landrace|74110;jarc 74110;gibirinna 74110;741 10
74112|74112|landrace|74112;jarc 74112
74140|74140|landrace|74140
74158|74158|landrace|74158;jarc 74158
74165|74165|landrace|74165
75227|75227|landrace|75227
74148|74148|landrace|74148
kurume|Kurume|landrace|kurume;kurmie;kurmi
wolisho|Wolisho|landrace|wolisho;wolicho;walisho
gesha|Gesha|landrace|gesha;geisha;gesha panama;geisha panama;panama geisha;panama gesha;t2722;abyssinian geisha;vc 496;green tip gesha;bronze tip gesha;green tip geisha;bronze tip geisha
gesha-1931|Gesha 1931|landrace|gesha 1931;geisha 1931;g1931
gori-gesha|Gori Gesha|landrace|gori gesha;gori geisha
wush-wush|Wush Wush|landrace|wush wush;wushwush
rume-sudan|Rume Sudan|landrace|rume sudan;sudan rume;rs 510
java|Java|landrace|java;abyssinia;abysinia;abyssinian;absynnian
pink-bourbon|Pink Bourbon|landrace|pink bourbon;bourbon pink;bourbon rosado;rosado
orange-bourbon|Orange Bourbon||orange bourbon;bourbon naranja
sidra|Sidra|landrace|sidra;bourbon sidra|q
papayo|Papayo||papayo|q
bourbon-aji|Bourbon Ají|landrace|bourbon aji;aji|q
chiroso|Chiroso|landrace|chiroso;bourbon chiroso;caturra chiroso|q
yemenia|Yemenia|yemen|yemenia;new yemen
udaini|Udaini|yemen|udaini;udaine;odaini;al udaini
tufahi|Tufahi|yemen|tufahi;tuffahi;tofahi
dawairi|Dawairi|yemen|dawairi;dawari;dwairi
jaadi|Jaadi|yemen|jaadi;jadi
typica|Typica|typica|typica;tipica;criollo;arabigo
blue-mountain|Blue Mountain|typica|blue mountain;jamaica blue mountain;jbm
kent|Kent|typica|kent;kents
maragogipe|Maragogipe|typica|maragogipe;maragogype;maragojipe;elephant bean;marago
pache|Pache|typica|pache;pache comun
villalobos|Villalobos|typica|villalobos;villa lobos
sl34|SL34|typica|sl34
sl14|SL14|typica|sl14
mibirizi|Mibirizi|typica|mibirizi;mibrizi
typica-mejorado|Typica Mejorado||typica mejorado;tipica mejorado;tipica mejorada;mejorado
bourbon|Bourbon|bourbon|bourbon;red bourbon;bourbon rojo;borbon;bourbon vermelho;bourbon tradicional;bourbon rouge
yellow-bourbon|Yellow Bourbon|bourbon|yellow bourbon;bourbon amarelo;bourbon amarillo;amarelo
sl28|SL28|bourbon|sl28
k7|K7|bourbon|k7
french-mission|French Mission|bourbon|french mission;french mission bourbon
jackson|Jackson|bourbon|jackson;jackson 2;jackson 2 1257
bm139|Bourbon Mayaguez|bourbon|bourbon mayaguez;bm139;bm 139;bm71;mayaguez
laurina|Laurina|bourbon|laurina;bourbon pointu;pointu;leroy;le roy
caturra|Caturra|bourbon|caturra;caturra rojo;caturra amarillo;caturra vermelho;caturra amarelo;yellow caturra;red caturra;orange caturra
pacas|Pacas|bourbon|pacas
villa-sarchi|Villa Sarchi|bourbon|villa sarchi;villasarchi;sarchi
tekisic|Tekisic|bourbon|tekisic;tekisik;bourbon tekisic
mundo-novo|Mundo Novo|cross|mundo novo;mundo nuevo
catuai|Catuaí|cross|catuai;catuai rojo;catuai amarillo;catuai vermelho;catuai amarelo;red catuai;yellow catuai;h2077
pacamara|Pacamara|cross|pacamara
timor-hybrid|Timor Hybrid|introgressed|timor hybrid;hybrid of timor;hibrido de timor;hdt;tim tim;timtim
catimor|Catimor|introgressed|catimor;catimore;katimor
sarchimor|Sarchimor|introgressed|sarchimor;t5296;h361
castillo|Castillo|introgressed|castillo;castillo general;variedad castillo;castillo naranjal;castillo paraguaicito;castillo santa barbara;castillo pueblo bello;castillo el rosario;castillo la trinidad;castillo el tambo;castillo tambo;castillo rosario
colombia-var|Colombia|introgressed|colombia;variedad colombia;colombia f6;colombia variety
tabi|Tabi|introgressed|tabi
cenicafe-1|Cenicafé 1|introgressed|cenicafe 1;cenicafe uno;ceni 1
costa-rica-95|Costa Rica 95|introgressed|costa rica 95;cr95
lempira|Lempira|introgressed|lempira
ihcafe-90|IHCAFE 90|introgressed|ihcafe 90;ih90
catisic|Catisic|introgressed|catisic
oro-azteca|Oro Azteca|introgressed|oro azteca
anacafe-14|Anacafé 14|introgressed|anacafe 14
parainema|Parainema|introgressed|parainema;paraineima
marsellesa|Marsellesa|introgressed|marsellesa;marseillesa;marsellaise
cuscatleco|Cuscatleco|introgressed|cuscatleco
obata|Obatã|introgressed|obata;obata rojo;obata red;obata vermelho;obata amarelo;obata amarillo
tupi|Tupi|introgressed|tupi
iapar-59|IAPAR 59|introgressed|iapar 59;iapar59
ipr-107|IPR 107|introgressed|ipr 107
limani|Limani|introgressed|limani
monte-claro|Monte Claro|introgressed|monte claro;monteclaro
chandragiri|Chandragiri|introgressed|chandragiri;sln 13;selection 13
paraiso|Paraíso|introgressed|paraiso;paraiso mg h 419 1
catigua|Catiguá|introgressed|catigua;catigua mg2
icatu|Icatu|introgressed|icatu;icatu vermelho;icatu amarelo;icatu precoce
catucai|Catucaí|introgressed|catucai;catucai vermelho;catucai amarelo;catucai acu
arara|Arara|introgressed|arara;arara amarelo;yellow arara
ateng|Ateng|introgressed|ateng;ateng super;ateng jaluk;ateng jeluk
andungsari|Andungsari|introgressed|andungsari
sigarar-utang|Sigarar Utang|introgressed|sigarar utang
s795|S795|introgressed|s795;s 795;jember;lini s;line s
sln-9|Selection 9|introgressed|sln 9;sln9;selection 9
batian|Batian|introgressed|batian
centroamericano|Centroamericano|f1|centroamericano;centro americano;centroamericano h1;h1 centroamericano;h1;hybrid h1
starmaya|Starmaya|f1|starmaya;star maya
mundo-maya|Mundo Maya|f1|mundo maya;mundomaya;ec16;h16
milenio|Milenio|f1|milenio;milenium;millennium;h10
casiopea|Casiopea|f1|casiopea;cassiopea;cassiopeia
evaluna|Evaluna|f1|evaluna;ec18;h18
nayarita|Nayarita|f1|nayarita;ec19;h19
mundomex|MundoMex|f1|mundomex;mundo mex;ec15;h15
esperanza|Esperanza|f1|esperanza;esperanza l4a5;l4a5
h3|H3|f1|h3;hybrid h3
ruiru-11|Ruiru 11|f1|ruiru 11;ruiru11;r11
robusta|Robusta|species|robusta;canephora;coffea canephora;c canephora;conilon;conillon;fine robusta
liberica|Liberica|species|liberica;coffea liberica;c liberica;barako;kapeng barako;baraco
excelsa|Excelsa|species|excelsa;coffea excelsa;dewevrei;coffea dewevrei
eugenioides|Eugenioides|species|eugenioides;eugenoides;coffea eugenioides
stenophylla|Stenophylla|species|stenophylla;coffea stenophylla
racemosa|Racemosa|species|racemosa;coffea racemosa`;
            // words people write in the Variety box that aren't varieties
            const NOT_VARIETY = { 'single origin': 'single-origin', 'single estate': 'single-origin', 'single farm': 'single-origin', blend: 'blend', 'house blend': 'blend', 'espresso blend': 'blend', espresso: 'espresso', specialty: 'specialty', 'specialty grade': 'specialty', mixed: 'mixed', various: 'mixed', multiple: 'mixed', unknown: 'unknown', na: 'unknown', 'n a': 'unknown', arabica: 'arabica', 'coffea arabica': 'arabica', 'c arabica': 'arabica', '100 arabica': 'arabica', 'arabica coffee': 'arabica' };
            // what a page or a chip says about one (sourced, short; the decode puts them together)
            const SAY = {
                caturra: ['is a compact mutation of Bourbon found in Brazil', 'wcr-caturra'],
                gesha: ['is an Ethiopian landrace that became famous in Panama', 'wcr-geisha'],
                sl28: ['was picked from a single tree in Kenya in 1935', 'wcr-sl28'],
                sl34: ['was picked from a single tree in Kenya in the late 1930s', 'wcr-sl34'],
                bourbon: ['went from Yemen to Réunion (once Bourbon Island) in the early 1700s', 'wcr-bourbon'],
                typica: ['is one of the most important old lines, spread from Yemen through India and Java to the world', 'wcr-typica'],
                catuai: ['is a Mundo Novo × Caturra cross from Brazil', 'wcr-catuai'],
                pacamara: ['is a Pacas × Maragogipe cross from El Salvador', 'wcr-pacamara'],
                batian: ['is a Kenyan variety released in 2010 to resist coffee berry disease', 'wcr-batian'],
                java: ['is an Ethiopian landrace, long taken for a Typica', 'wcr-java'],
                castillo: ['was bred in Colombia to hold up against leaf rust', 'gcr-castillo'],
                'colombia-var': ['was bred in Colombia to hold up against leaf rust', 'jcc-colombia'],
                tabi: ['was bred in Colombia to hold up against leaf rust', 'jcc-colombia'],
                'pink-bourbon': ['is sold as a Bourbon, but DNA tests point to an Ethiopian landrace', 'cafeimports-pink'],
                chiroso: ['is grown mainly around Urrao in Antioquia, Colombia; early DNA work hints at Ethiopian roots', 'sucafina-glossary'],
                'ethiopian-landrace': ["means Ethiopia's many local coffee types, picked from wild coffee long ago", 'roasterspack-heirloom']
            };

            // ---- countries: code | name | adjective | continent (the coffee map's five) | other names and regions people write
            const CONTINENTS = ['Africa', 'Asia', 'Oceania', 'South America', 'North & Central America'];
            const COUNTRIES = `
ETH|Ethiopia|Ethiopian|Africa|ethiopia;ethiopian;abyssinia
KEN|Kenya|Kenyan|Africa|kenya;kenyan
RWA|Rwanda|Rwandan|Africa|rwanda;rwandan
BDI|Burundi|Burundian|Africa|burundi;burundian
UGA|Uganda|Ugandan|Africa|uganda;ugandan
TZA|Tanzania|Tanzanian|Africa|tanzania;tanzanian
COD|DR Congo|Congolese|Africa|congo;dr congo;drc;democratic republic of the congo;democratic republic of congo;congolese
MWI|Malawi|Malawian|Africa|malawi;malawian
ZMB|Zambia|Zambian|Africa|zambia;zambian
ZWE|Zimbabwe|Zimbabwean|Africa|zimbabwe;zimbabwean
CMR|Cameroon|Cameroonian|Africa|cameroon;cameroonian
CIV|Côte d'Ivoire|Ivorian|Africa|cote divoire;cote d ivoire;ivory coast;ivorian
MDG|Madagascar|Malagasy|Africa|madagascar
SLE|Sierra Leone|Sierra Leonean|Africa|sierra leone
SDS|South Sudan|South Sudanese|Africa|south sudan
YEM|Yemen|Yemeni|Asia|yemen;yemeni
SAU|Saudi Arabia|Saudi|Asia|saudi arabia;saudi;jazan;jizan;khawlani
IND|India|Indian|Asia|india;indian
NPL|Nepal|Nepali|Asia|nepal
IDN|Indonesia|Indonesian|Asia|indonesia;indonesian
VNM|Vietnam|Vietnamese|Asia|vietnam;viet nam;vietnamese
LAO|Laos|Lao|Asia|laos;lao
THA|Thailand|Thai|Asia|thailand;thai
MMR|Myanmar|Burmese|Asia|myanmar;burma
CHN|China|Chinese|Asia|china;chinese
PHL|Philippines|Philippine|Asia|philippines;philippine
TLS|Timor-Leste|Timorese|Asia|timor leste;east timor;timor
TWN|Taiwan|Taiwanese|Asia|taiwan;taiwanese
LKA|Sri Lanka|Sri Lankan|Asia|sri lanka;ceylon
MYS|Malaysia|Malaysian|Asia|malaysia
PNG|Papua New Guinea|Papua New Guinean|Oceania|papua new guinea;png
AUS|Australia|Australian|Oceania|australia;australian
HI|Hawaii|Hawaiian|Oceania|hawaii;hawaiian;hawai i
BRA|Brazil|Brazilian|South America|brazil;brasil;brazilian;brasileiro
COL|Colombia|Colombian|South America|colombia;colombian;columbia;columbian
PER|Peru|Peruvian|South America|peru;peruvian
ECU|Ecuador|Ecuadorian|South America|ecuador;ecuadorian
BOL|Bolivia|Bolivian|South America|bolivia;bolivian
VEN|Venezuela|Venezuelan|South America|venezuela;venezuelan
GTM|Guatemala|Guatemalan|North & Central America|guatemala;guatemalan
HND|Honduras|Honduran|North & Central America|honduras;honduran
SLV|El Salvador|Salvadoran|North & Central America|el salvador;salvadoran;salvadorian
NIC|Nicaragua|Nicaraguan|North & Central America|nicaragua;nicaraguan
CRI|Costa Rica|Costa Rican|North & Central America|costa rica;costa rican
PAN|Panama|Panamanian|North & Central America|panama;panamanian
MEX|Mexico|Mexican|North & Central America|mexico;mexican
JAM|Jamaica|Jamaican|North & Central America|jamaica;jamaican
DOM|Dominican Republic|Dominican|North & Central America|dominican republic;dominican
HTI|Haiti|Haitian|North & Central America|haiti;haitian
CUB|Cuba|Cuban|North & Central America|cuba;cuban
PRI|Puerto Rico|Puerto Rican|North & Central America|puerto rico;puerto rican`;
            // regions and towns: country | region id | name | other spellings (";") | w = weak (the same name is used
            // elsewhere: counts only when no named country says otherwise)
            const PLACES = `
COL|huila|Huila|huila
COL|cauca|Cauca|cauca
COL|narino|Nariño|narino
COL|tolima|Tolima|tolima
COL|antioquia|Antioquia|antioquia
COL|caldas|Caldas|caldas
COL|quindio|Quindío|quindio
COL|risaralda|Risaralda|risaralda
COL|valle-del-cauca|Valle del Cauca|valle del cauca;cauca valley
COL|santander|Santander|santander
COL|norte-de-santander|Norte de Santander|norte de santander
COL|cundinamarca|Cundinamarca|cundinamarca
COL|magdalena|Magdalena|magdalena
COL|sierra-nevada|Sierra Nevada de Santa Marta|sierra nevada de santa marta;santa marta
COL|eje-cafetero|Eje Cafetero|eje cafetero;coffee axis;coffee triangle
COL|huila|Pitalito|pitalito|place
COL|huila|Acevedo|acevedo|place
COL|huila|Bruselas|bruselas|place
COL|cauca|Inzá|inza|place
COL|antioquia|Urrao|urrao|place
ETH|yirgacheffe|Yirgacheffe|yirgacheffe;yirgachefe;yirga cheffe;yirga chefe;yirgacheffee;gedeo
ETH|yirgacheffe|Gedeb|gedeb|place
ETH|yirgacheffe|Kochere|kochere;kochore|place
ETH|yirgacheffe|Wenago|wenago|place
ETH|guji|Guji|guji
ETH|guji|Hambela|hambela;hambella|place
ETH|guji|Uraga|uraga;uraaga|place
ETH|guji|Kercha|kercha|place
ETH|guji|Shakiso|shakiso;shakisso;odo shakiso|place
ETH|guji|Adola|adola|place
ETH|guji|Bule Hora|bule hora|place
ETH|sidama|Sidama|sidama;sidamo
ETH|sidama|Bensa|bensa|place
ETH|sidama|Chire|chire|place
ETH|limu|Limu|limu;limmu
ETH|jimma|Jimma|jimma;djimma;djimmah;jima
ETH|jimma|Agaro|agaro|place
ETH|harrar|Harrar|harrar;harar;harer;hararghe
ETH|kaffa|Kaffa|kaffa;keffa
ETH|bench-maji|Bench Maji|bench maji;bench sheko
ETH|wollega|Wollega|wollega;lekempti;nekemte;wallaga|w
ETH||Nensebo|nensebo;nansebo|place
KEN|nyeri|Nyeri|nyeri
KEN|kirinyaga|Kirinyaga|kirinyaga
KEN|muranga|Murang'a|muranga
KEN|kiambu|Kiambu|kiambu
KEN|embu|Embu|embu
KEN|meru|Meru|meru|w
KEN|kisii|Kisii|kisii
PER|cajamarca|Cajamarca|cajamarca
PER|cajamarca|Jaén|jaen|place
PER|cajamarca|San Ignacio|san ignacio|place
PER|amazonas|Amazonas|amazonas|w
PER|san-martin|San Martín|san martin|w
PER|piura|Piura|piura
PER|junin|Junín|junin
PER|junin|Chanchamayo|chanchamayo|place
PER|junin|Satipo|satipo|place
PER|pasco|Pasco|pasco
PER|pasco|Oxapampa|oxapampa|place
PER|huanuco|Huánuco|huanuco
PER|ayacucho|Ayacucho|ayacucho
PER|cusco|Cusco|cusco;cuzco
PER|cusco|La Convención|la convencion|place
PER|puno|Puno|puno
PER|puno|Sandia|sandia|place
BRA|cerrado|Cerrado Mineiro|cerrado mineiro;cerrado
BRA|sul-de-minas|Sul de Minas|sul de minas;south minas
BRA|mogiana|Mogiana|mogiana;alta mogiana
BRA|mantiqueira|Mantiqueira de Minas|mantiqueira;mantiqueira de minas
BRA|matas-de-minas|Matas de Minas|matas de minas
BRA|carmo-de-minas|Carmo de Minas|carmo de minas
BRA|minas-gerais|Minas Gerais|minas gerais;minas
BRA|espirito-santo|Espírito Santo|espirito santo
BRA|chapada|Chapada Diamantina|chapada diamantina
BRA|rondonia|Rondônia|rondonia
BRA|campo-das-vertentes|Campo das Vertentes|campo das vertentes
BRA|oeste-da-bahia|Oeste da Bahia|oeste da bahia;western bahia
GTM|huehuetenango|Huehuetenango|huehuetenango;huehue
GTM|antigua|Antigua|antigua|w
GTM|atitlan|Atitlán|atitlan
GTM|acatenango|Acatenango|acatenango
GTM|coban|Cobán|coban
GTM|fraijanes|Fraijanes|fraijanes
GTM|nuevo-oriente|Nuevo Oriente|nuevo oriente;new oriente
GTM|san-marcos|San Marcos|san marcos|w
HND|marcala|Marcala|marcala
HND|santa-barbara|Santa Bárbara|santa barbara|w
HND|copan|Copán|copan|w
HND|opalaca|Opalaca|opalaca
HND|montecillos|Montecillos|montecillos
HND|el-paraiso|El Paraíso|el paraiso|w
HND|comayagua|Comayagua|comayagua
HND|intibuca|Intibucá|intibuca
HND|agalta|Agalta|agalta
CRI|tarrazu|Tarrazú|tarrazu
CRI|west-valley|West Valley|west valley;valle occidental
CRI|tres-rios|Tres Ríos|tres rios
CRI|orosi|Orosi|orosi
CRI|turrialba|Turrialba|turrialba
CRI|brunca|Brunca|brunca
CRI|central-valley|Central Valley|central valley;valle central|w
CRI|guanacaste|Guanacaste|guanacaste
PAN|boquete|Boquete|boquete
PAN|volcan|Volcán|volcan|w
PAN|chiriqui|Chiriquí|chiriqui
PAN|renacimiento|Renacimiento|renacimiento
MEX|chiapas|Chiapas|chiapas
MEX|oaxaca|Oaxaca|oaxaca
MEX|veracruz|Veracruz|veracruz
MEX|puebla|Puebla|puebla
MEX|veracruz|Coatepec|coatepec|place
NIC|jinotega|Jinotega|jinotega
NIC|matagalpa|Matagalpa|matagalpa
NIC|nueva-segovia|Nueva Segovia|nueva segovia
NIC|esteli|Estelí|esteli
NIC|madriz|Madriz|madriz
SLV|santa-ana|Santa Ana|santa ana|w
SLV|chalatenango|Chalatenango|chalatenango
SLV|apaneca|Apaneca-Ilamatepec|apaneca;apaneca ilamatepec
ECU|loja|Loja|loja
ECU|zamora-chinchipe|Zamora Chinchipe|zamora chinchipe;zamora
ECU|pichincha|Pichincha|pichincha
ECU|galapagos|Galápagos|galapagos
BOL|caranavi|Caranavi|caranavi
BOL|yungas|Yungas|yungas;los yungas
RWA|nyamasheke|Nyamasheke|nyamasheke
RWA|huye|Huye|huye;butare
RWA|karongi|Karongi|karongi;kibuye
RWA|rusizi|Rusizi|rusizi;cyangugu
RWA|rulindo|Rulindo|rulindo
RWA|kivu|Lake Kivu|kivu;lake kivu|w
RWA|gakenke|Gakenke|gakenke|w
BDI|kayanza|Kayanza|kayanza
BDI|ngozi|Ngozi|ngozi
BDI|kirundo|Kirundo|kirundo
BDI|muyinga|Muyinga|muyinga
UGA|bugisu|Bugisu|bugisu;mt elgon;mount elgon;elgon;sipi
UGA|rwenzori|Rwenzori|rwenzori
UGA|west-nile|West Nile|west nile
TZA|kilimanjaro|Kilimanjaro|kilimanjaro;moshi
TZA|arusha|Arusha|arusha;mount meru;mt meru
TZA|mbeya|Mbeya|mbeya
TZA|mbinga|Mbinga|mbinga;ruvuma
COD|kivu|Kivu|north kivu;south kivu;idjwi;kalehe;bukavu
COD|ituri|Ituri|ituri
YEM|haraz|Haraz|haraz;harazi;haraaz
YEM|matari|Bani Matar|matari;mattari;bani matar
YEM|hayma|Hayma|hayma;haymah
YEM|sanani|Sanani|sanani;sanaani
YEM||Mocha|mocha;mokha;mokka|place
IDN|sumatra|Sumatra|sumatra;sumatran;sumatera
IDN|aceh|Aceh|aceh;gayo;takengon;bener meriah
IDN|sumatra|Mandheling|mandheling;mandailing|place
IDN|sumatra|Lintong|lintong;lake toba;toba|place
IDN|java|Java|java;jawa;ijen;preanger
IDN|sulawesi|Sulawesi|sulawesi;celebes;toraja;kalosi;enrekang
IDN|bali|Bali|bali;kintamani
IDN|flores|Flores|flores;bajawa
IDN|papua|Papua|wamena;baliem
IND|karnataka|Karnataka|karnataka;chikmagalur;chikkamagaluru;coorg;kodagu;baba budan
IND|kerala|Kerala|kerala;wayanad
IND|araku|Araku|araku;araku valley
IND|malabar|Malabar|malabar;monsooned malabar
PNG|highlands|Highlands|eastern highlands;western highlands;goroka;mt hagen;mount hagen;wahgi;waghi;jiwaka;simbu;chimbu
HI|kona|Kona|kona
HI|kau|Kaʻū|kau
HI|maui|Maui|maui
HI|kauai|Kauaʻi|kauai
JAM|blue-mountain|Blue Mountain|blue mountain;blue mountains
CHN|yunnan|Yunnan|yunnan;puer;baoshan
VNM|lam-dong|Lâm Đồng|lam dong;dalat;da lat
LAO|bolaven|Bolaven Plateau|bolaven;paksong;champasak
THA|chiang-rai|Chiang Rai|chiang rai;doi chaang;doi chang
TLS|ermera|Ermera|ermera;maubisse;letefoho`;
            const CONT_WORDS = { 'south america': 'South America', 'central america': 'North & Central America', 'north america': 'North & Central America', 'latin america': '', africa: 'Africa', 'east africa': 'Africa', asia: 'Asia', 'southeast asia': 'Asia', oceania: 'Oceania', 'the americas': '', americas: '', pacific: 'Oceania', 'indo pacific': '' };
            const BLEND_WORDS = new Set(['blend', 'house blend', 'espresso blend', 'various', 'mixed', 'multiple', 'multi origin', 'world blend']);

            // ---- processes: id | name | layer | other names
            // layers: base (washed / natural / honey / wet-hulled), fermentation, microbes, ingredients, after, drying,
            // decaf and grade (decaf and grade are their own axes, never a process)
            const PROCESSES = `
washed|Washed|base|washed;fully washed;full washed;full wash;lavado;lave;wet process;wet processed;wet processing;washed process
natural|Natural|base|natural;naturals;dry process;dry processed;sun dried;sun dry;unwashed;seco;natural process;natural processed;full natural
honey|Honey|base|honey;honeyed;miel;honey process;honey processed;white honey;yellow honey;golden honey;red honey;black honey;pulped natural;cereja descascada;cereja descascado;descascado;despolpado
wet-hulled|Wet-hulled|base|wet hulled;wet hull;giling basah;semi lavado
fermentation|Fermented|fermentation|fermented;fermentation;ferment;fermentado;fermented in tank;tank fermented
extended|Extended fermentation|fermentation|extended fermentation;extended ferment;long ferment;long fermentation;longer ferment;extended;prolonged fermentation
anaerobic|Anaerobic|fermentation|anaerobic;anaerobico;anaerobic fermentation;anaerobic fermented;anoxic;sealed tank;ana;double anaerobic;anaerobic slow dry;siaf
carbonic|Carbonic maceration|fermentation|carbonic maceration;carbonic;maceracion carbonica;co2 macerated;co2 maceration;cm;jasper
cold-ferment|Cold fermentation|fermentation|cold fermentation;cold ferment;cold fermented;low temperature fermentation
kenyan-soak|Kenyan double ferment|after|double fermented;double fermentation;double ferment;double washed;kenya process;kenyan process;kenya style;kenyan style;soaked;kenyan washed;kenya washed
lactic|Lactic|microbes|lactic;lactic fermentation;lactic process;lacto;lactico
yeast|Yeast-inoculated|microbes|yeast;yeasts;yeast fermentation;yeast inoculated;yeast fermented;inoculated;inoculation;lalcafe;starter culture;levadura
koji|Koji|microbes|koji;aspergillus
mossto|Mossto|microbes|mossto;mosto;mosto fermented
co-ferment|Co-fermented|ingredients|co fermented;cofermented;co ferment;coferment;co fermentation;cofermentation;infused;infusion;fruit maceration;macerated;barrel aged;barrel;whiskey barrel;whisky barrel;rum barrel;bourbon barrel
thermal-shock|Thermal shock|after|thermal shock;thermo shock;thermoshock;choque termico
monsooned|Monsooned|after|monsooned;monsoon;monsooning
slow-dry|Slow dry|drying|slow dry;slow dried;asd;extended dry;dark room;shade dried
raised-beds|Raised beds|drying|raised bed;raised beds;african bed;african beds;camas africanas
patio|Patio-dried|drying|patio;patio dried
mechanical|Mechanical drying|drying|mechanical drying;mechanically dried;guardiola;silo dried;drum dried
demucilaged|Demucilaged|variant|demucilaged;mechanically demucilaged;eco pulper;ecopulper;desmucilaginado;mechanically washed`;
            const DECAF = `
swiss-water|Swiss Water|swiss water;swiss water process;swp
mountain-water|Mountain Water|mountain water;mountain water process;mwp;descamex
sugarcane|Sugarcane (ethyl acetate)|sugarcane;sugar cane;sugarcane decaf;ethyl acetate;ea;ea decaf;descafecol;natural decaf;sugarcane process
co2|CO2|co2 decaf;co2 process;supercritical co2;supercritical
solvent|Methylene chloride|methylene chloride;mc;european method;european process;kvw;solvent
decaf|Decaf|decaf;decaffeinated;decaffeinato;descafeinado`;
            const GRADE = /^(?:g|gr|grade)\s?[1-5]$|^(?:aa|ab|pb|aaa|aa plus|aa\+|peaberry|caracol|caracolillo|shb|shg|hb|ep|supremo|excelso|ugq|sht|european preparation|strictly hard bean|strictly high grown|grade one|grade two|top|fancy|extra fancy)$/;
            const NONE_PROC = new Set(['mixed', 'mystery', 'various', 'unknown', 'other', 'experimental', 'na', 'n a', 'secret', 'n']);
            const HONEY_COLORS = { white: 'white', yellow: 'yellow', golden: 'yellow', red: 'red', black: 'black' };

            // ---- build the lookups (squashed text -> entry), longest names first when scanning
            const idx = { variety: new Map(), origin: new Map(), process: new Map(), decaf: new Map() };
            const entries = new Map();   // "kind:id" -> entry
            const maxTok = { variety: 1, origin: 1, process: 1, decaf: 1 };
            const add = (kind, alias, val) => { const k = squash(alias); if (!k) return; if (!idx[kind].has(k)) idx[kind].set(k, val); maxTok[kind] = Math.max(maxTok[kind], norm(alias).split(' ').length); };
            const lines = s => s.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.split('|'));
            lines(VARIETIES).forEach(([id, name, fam, al, flags]) => {
                const e = { kind: fam === 'species' ? 'species' : 'variety', id, name, family: fam || '', q: (flags || '').includes('q'), also: [] };
                entries.set(`${e.kind}:${id}`, e);
                (al || '').split(';').forEach(a => { add('variety', a, e); const t = a.trim(); if (t && squash(t) !== squash(name) && /[a-z]/.test(t) && t.split(' ').length <= 4) e.also.push(t); });
            });
            Object.entries(NOT_VARIETY).forEach(([w, k]) => { if (!idx.variety.has(squash(w))) idx.variety.set(squash(w), { kind: 'not', id: k }); });
            const country = {};
            lines(COUNTRIES).forEach(([code, name, adj, cont, al]) => {
                const e = { kind: 'origin', id: code, code, name, adj, continent: cont };
                country[code] = e; entries.set(`origin:${code}`, e);
                al.split(';').forEach(a => add('origin', a, { t: 'country', code }));
            });
            const regions = {};   // "COL:huila" -> region entry
            lines(PLACES).forEach(([code, rid, name, al, flags]) => {
                const place = (flags || '').includes('place'), weak = (flags || '').includes('w');
                if (!place && rid && !regions[`${code}:${rid}`]) regions[`${code}:${rid}`] = { kind: 'region', code, id: rid, name };
                const pid = place ? squash(name) : '';
                al.split(';').forEach(a => add('origin', a, { t: place ? 'place' : 'region', code, region: rid || '', place: pid, placeName: place ? name : '', weak }));
            });
            Object.entries(CONT_WORDS).forEach(([w, c]) => { if (!idx.origin.has(squash(w))) idx.origin.set(squash(w), { t: 'continent', continent: c }); });
            BLEND_WORDS.forEach(w => { if (!idx.origin.has(squash(w))) idx.origin.set(squash(w), { t: 'blend' }); });
            const proc = {};
            lines(PROCESSES).forEach(([id, name, layer, al]) => {
                const e = { kind: 'process', id, name, layer };
                proc[id] = e; if (layer !== 'variant') entries.set(`process:${id}`, e);
                al.split(';').forEach(a => add('process', a, e));
            });
            const decafs = {};
            lines(DECAF).forEach(([id, name, al]) => { const e = { kind: 'decaf', id, name }; decafs[id] = e; al.split(';').forEach(a => add('decaf', a, e)); });

            // ---- scanning: split on the separators people use, then longest names first, word by word
            const parts = text => String(text || '').split(SPLIT).map(p => p.trim()).filter(Boolean);
            function scan(kind, text) {
                const toks = norm(text).split(' ').filter(Boolean), hits = [], rest = [];
                let i = 0;
                while (i < toks.length) {
                    let hit = null, j = Math.min(toks.length, i + maxTok[kind] + 2);
                    for (; j > i; j--) { const k = toks.slice(i, j).join(''); if (idx[kind].has(k)) { hit = idx[kind].get(k); break; } }
                    if (hit) { hits.push({ hit, text: toks.slice(i, j).join(' ') }); i = j; } else { rest.push(toks[i]); i++; }
                }
                return { hits, rest, toks };
            }
            // a short suggestion for a typo ("Natual" -> Natural), only ever offered, never applied without a tap
            function dist(a, b) {
                const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
                const d = Array.from({ length: m + 1 }, (_, i) => [i].concat(Array(n).fill(0)));
                for (let j = 1; j <= n; j++) d[0][j] = j;
                for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) {
                    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
                    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
                }
                return d[m][n];
            }
            function typo(kind, word) {
                const w = squash(word); if (w.length < 4 || /\d/.test(w)) return null;
                const lim = w.length >= 6 ? 2 : 1;
                let best = null, bd = 9, tie = false;
                idx[kind].forEach((v, k) => {
                    if (k.length < 4 || Math.abs(k.length - w.length) > lim) return;
                    if (kind === 'variety' && v.kind === 'not') return;
                    const dd = dist(w, k);
                    if (dd < bd) { bd = dd; best = { k, v }; tie = false; } else if (dd === bd && best && best.v !== v) tie = true;
                });
                return best && bd <= lim && !tie ? best : null;
            }
            const labelOf = v => v.name || (v.t === 'country' ? country[v.code].name : v.placeName || (regions[`${v.code}:${v.region}`] || {}).name) || '';

            // ---- the three fields
            function readVariety(text) {
                const out = { ids: [], not: '', species: '', suggest: null, unknown: [] };
                parts(text).forEach(p => {
                    const n = norm(p); if (!n) return;
                    if (n === '744') { if (!out.ids.includes('744')) out.ids.push('744'); return; }
                    const s = scan('variety', p);
                    s.hits.forEach(({ hit }) => {
                        if (hit.kind === 'not') { if (hit.id === 'arabica') out.species = 'arabica'; else if (!out.not) out.not = hit.id; return; }
                        if (hit.kind === 'species') { if (!out.species) out.species = hit.id; return; }
                        if (!out.ids.includes(hit.id)) out.ids.push(hit.id);
                    });
                    if (!s.hits.length) {
                        const t = typo('variety', p);
                        if (t && !out.suggest && t.v.kind !== 'not') out.suggest = { typed: p, id: t.v.id, name: t.v.name };
                        else out.unknown.push(p);
                    }
                });
                return out;
            }
            function readOrigin(text) {
                const found = [], cont = [];
                let blendWord = false, suggest = null; const unknown = [];
                parts(text).forEach(p => {
                    const s = scan('origin', p);
                    s.hits.forEach(({ hit }) => {
                        if (hit.t === 'continent') { if (hit.continent) cont.push(hit.continent); return; }
                        if (hit.t === 'blend') { blendWord = true; return; }
                        found.push(hit);
                    });
                    if (!s.hits.length) {
                        const t = typo('origin', p);
                        if (t && !suggest && (t.v.t === 'country' || t.v.t === 'region')) suggest = { typed: p, name: labelOf(t.v), code: t.v.code };
                        else unknown.push(p);
                    }
                });
                // a weak name (one used in several places, like "Santa Bárbara") counts only when nothing surer says otherwise
                const strong = found.filter(h => !h.weak), sure = new Set(strong.map(h => h.code));
                const use = strong.length ? found.filter(h => !h.weak || sure.has(h.code)) : found;
                const codes = []; use.forEach(h => { if (!codes.includes(h.code)) codes.push(h.code); });
                const main = codes.length === 1 ? codes[0] : '';
                const reg = main ? use.find(h => h.code === main && h.region) : null;
                const plc = main ? use.find(h => h.code === main && h.t === 'place') : null;
                return { countries: codes, region: reg ? reg.region : '', place: plc ? plc.place : '', placeName: plc ? plc.placeName : '', blend: codes.length > 1 || (blendWord && codes.length !== 1), continents: [...new Set(cont)], suggest: codes.length ? null : suggest, unknown };
            }
            const SEMI_WASHED_DEMUC = new Set(['BRA', 'GTM', 'HND', 'SLV', 'NIC', 'CRI', 'PAN', 'MEX']);
            function readProcess(text, ctx = {}) {
                const out = { base: '', variant: '', honey: '', layers: [], decaf: '', grade: [], added: false, ask: null, suggest: null, none: false, unknown: [] };
                const bases = [];
                const raw = String(text || '');
                if (/\b\d{2,3}\s?(?:h|hr|hrs|hour|hours)\b/i.test(raw) && !out.layers.includes('extended')) out.layers.push('extended');   // "72 hour", "120h": a long ferment
                parts(raw).forEach(p => {
                    let n = norm(p).replace(/\b\d{2,3} ?(?:h|hr|hrs|hour|hours)\b/g, ' ').replace(/\s+/g, ' ').trim();
                    if (!n) return;
                    if (NONE_PROC.has(n)) { out.none = true; return; }
                    if (GRADE.test(n)) { out.grade.push(n.toUpperCase()); return; }
                    // "semi-washed" means different things by country
                    if (/\bsemi washed\b|\bsemiwashed\b|\bsemi lavado\b/.test(n)) {
                        const c = (ctx.countries || [])[0] || '';
                        if (c === 'IDN') bases.push('wet-hulled');
                        else if (SEMI_WASHED_DEMUC.has(c)) { bases.push('washed'); out.variant = 'demucilaged'; }
                        else out.ask = { kind: 'semi-washed', options: ['wet-hulled', 'washed'] };
                        n = n.replace(/\bsemi ?washed\b|\bsemi lavado\b/g, ' ').trim(); if (!n) return;
                    }
                    const d = scan('decaf', n);
                    let leftover = n;
                    if (d.hits.length) {
                        d.hits.forEach(({ hit, text: t }) => { if (!out.decaf || out.decaf === 'decaf') out.decaf = hit.id; leftover = leftover.replace(t, ' '); });
                        leftover = leftover.replace(/\s+/g, ' ').trim();
                        if (!leftover || leftover === 'process') return;
                    }
                    const s = scan('process', leftover);
                    s.hits.forEach(({ hit, text: t }) => {
                        if (hit.layer === 'base') { bases.push(hit.id); if (hit.id === 'honey') { const c = Object.keys(HONEY_COLORS).find(k => t.startsWith(k)); if (c) out.honey = HONEY_COLORS[c]; if (/pulped|cereja|descasc|despolp/.test(t)) out.variant = 'pulped-natural'; } return; }
                        if (hit.layer === 'variant') { bases.push('washed'); out.variant = hit.id; return; }
                        if (hit.id === 'kenyan-soak') bases.push('washed');
                        if (!out.layers.includes(hit.id)) out.layers.push(hit.id);
                        if (hit.layer === 'ingredients') out.added = true;
                    });
                    const rest = s.rest.filter(w => !['process', 'processed', 'method', 'and', 'the', 'a', 'in', 'with', 'then', 'style', 'lot'].includes(w))
                        .filter(w => { if (GRADE.test(w)) { out.grade.push(w.toUpperCase()); return false; } return true; });
                    if (!s.hits.length && rest.length) {
                        const t = typo('process', leftover);
                        if (t && !out.suggest) out.suggest = { typed: p, id: t.v.id, name: t.v.name };
                        else out.unknown.push(p);
                    }
                });
                const uniq = [...new Set(bases)];
                if (uniq.length === 1) out.base = uniq[0];
                else if (uniq.length > 1) out.ask = { kind: 'two-bases', options: uniq };
                // "anaerobic" etc. with no base: the base stays unknown (never assume natural)
                if (out.layers.includes('extended') && out.layers.includes('fermentation')) out.layers = out.layers.filter(l => l !== 'fermentation');
                if (out.layers.includes('kenyan-soak')) out.layers = out.layers.filter(l => l !== 'fermentation');
                if (out.layers.includes('anaerobic') && out.layers.includes('fermentation')) out.layers = out.layers.filter(l => l !== 'fermentation');
                if (out.layers.includes('co-ferment') && out.layers.includes('fermentation')) out.layers = out.layers.filter(l => l !== 'fermentation');
                return out;
            }
            const ROASTS = { light: 'light', 'light medium': 'medium-light', 'medium light': 'medium-light', medium: 'medium', 'medium dark': 'medium-dark', dark: 'dark', omni: 'omni', filter: 'light', espresso: '' };
            const readRoast = t => ROASTS[norm(t)] || '';

            // ---- one coffee
            function read(bean) {
                const b = bean || {};
                const tea = b.kind === 'tea' || !!b.teaType;
                if (tea) return { v: VERSION, tea: true, variety: [], origin: { countries: [], region: '', place: '', blend: false }, process: { base: '', layers: [], decaf: '', grade: [], added: false } };
                const keep = b.learnKeep && typeof b.learnKeep === 'object' ? b.learnKeep : {};
                const v = readVariety(b.variety), o = readOrigin(b.origin), p = readProcess(b.process, o);
                // a dismissed question ("Keep as typed") isn't asked again while the text stays the same
                const kept = f => keep[f] && squash(keep[f]) === squash(b[f]);
                if (kept('process')) { p.suggest = null; p.ask = null; }
                if (kept('variety')) v.suggest = null;
                if (kept('origin')) o.suggest = null;
                return { v: VERSION, variety: v.ids, varietyNot: v.not, species: v.species, varietySuggest: v.suggest,
                    origin: { countries: o.countries, region: o.region, place: o.place, placeName: o.placeName, blend: o.blend, continents: o.continents }, originSuggest: o.suggest,
                    process: { base: p.base, variant: p.variant, honey: p.honey, layers: p.layers, decaf: p.decaf, grade: p.grade, added: p.added }, processAsk: p.ask, processSuggest: p.suggest,
                    roast: readRoast(b.roast) };
            }
            // what one form field says as it's typed (the chips under it)
            function field(kind, text, ctx = {}) {
                if (ctx.tea) return { chips: [] };
                const chips = [];
                if (kind === 'variety') {
                    const v = readVariety(text);
                    v.ids.forEach(id => { const e = entry('variety', id); chips.push({ t: 'ok', kind: 'variety', id, name: e ? e.name : id, meta: id === 'colombia-var' ? 'the variety' : e && e.q && e.family === 'landrace' ? 'Ethiopian roots?' : e && FAMILY[e.family] ? FAMILY[e.family] : '' }); });   // (? = early or second-hand DNA evidence: never stated as fact)
                    if (v.species && v.species !== 'arabica') { const e = entry('species', v.species); chips.push({ t: 'ok', kind: 'species', id: v.species, name: e.name, meta: 'a coffee species' }); }
                    if (v.species === 'arabica') chips.push({ t: 'warn', kind: 'variety', id: 'arabica', name: 'The species, not a variety', hint: 'arabica', suggestId: (ctx.countries || []).includes('ETH') ? 'ethiopian-landrace' : '' });
                    if (v.not) chips.push({ t: 'warn', kind: 'variety', id: v.not, name: v.not === 'single-origin' || v.not === 'blend' || v.not === 'espresso' || v.not === 'specialty' ? 'Not a variety' : 'Not a variety', hint: v.not });
                    if (v.suggest) chips.push({ t: 'q', kind: 'variety', id: v.suggest.id, name: v.suggest.name, typed: v.suggest.typed });
                    return { chips, hint: v.ids.includes('colombia-var') ? 'colombia-var' : v.ids.includes('java') ? 'java-var' : '' };
                }
                if (kind === 'origin') {
                    const o = readOrigin(text);
                    if (o.countries.length === 1) {
                        const c = country[o.countries[0]], r = o.region ? regions[`${c.code}:${o.region}`] : null;
                        const head = o.placeName || (r ? r.name : c.name);
                        chips.push({ t: 'ok', kind: 'origin', id: c.code, name: head, meta: head === c.name ? c.continent : [o.placeName && r ? r.name : '', c.name].filter(Boolean).join(', ') });
                    } else o.countries.forEach(code => chips.push({ t: 'ok', kind: 'origin', id: code, name: country[code].name, meta: '' }));
                    if (o.blend && o.countries.length > 1) chips.push({ t: 'info', kind: 'origin', id: 'blend', name: `A blend of ${o.countries.length} countries` });
                    if (o.suggest) chips.push({ t: 'q', kind: 'origin', id: o.suggest.code, name: o.suggest.name, typed: o.suggest.typed });
                    return { chips, tags: o };
                }
                if (kind === 'process') {
                    const p = readProcess(text, ctx);
                    if (p.base) chips.push({ t: 'ok', kind: 'process', id: p.base, name: processName(p) });
                    p.layers.forEach(id => chips.push({ t: 'ok', kind: 'process', id, name: proc[id].name, meta: id === 'co-ferment' ? 'added ingredients' : '' }));
                    if (p.decaf) chips.push({ t: 'ok', kind: 'decaf', id: p.decaf, name: p.decaf === 'decaf' ? 'Decaf' : `Decaf · ${decafs[p.decaf].name}` });
                    p.grade.forEach(g => chips.push({ t: 'info', kind: 'grade', id: g, name: `${g} · a grade, not a process` }));
                    if (p.ask) chips.push({ t: 'ask', kind: 'process', id: p.ask.kind, options: p.ask.options.map(o => ({ id: o, name: proc[o] ? proc[o].name : o })) });
                    if (p.suggest) chips.push({ t: 'q', kind: 'process', id: p.suggest.id, name: p.suggest.name, typed: p.suggest.typed });
                    return { chips };
                }
                return { chips };
            }
            const processName = p => p.base === 'honey' && p.honey ? `${p.honey[0].toUpperCase()}${p.honey.slice(1)} honey` : p.variant === 'pulped-natural' ? 'Pulped natural' : p.variant === 'demucilaged' ? 'Demucilaged' : (proc[p.base] || {}).name || '';
            function entry(kind, id) {
                if (kind === 'origin') return country[id] || null;
                if (kind === 'region') { const [c, r] = String(id).split(':'); return regions[`${c}:${r}`] || null; }
                if (kind === 'decaf') return decafs[id] || null;
                return entries.get(`${kind}:${id}`) || (kind === 'variety' ? entries.get(`species:${id}`) : null) || null;
            }

            // ---- the decode: what the bag's words mean, in plain words (one function, used everywhere)
            const andList = a => a.length <= 1 ? (a[0] || '') : a.length === 2 ? `${a[0]} and ${a[1]}` : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
            const NUMW = ['', 'one', 'two', 'three', 'four', 'five', 'six'];
            const PSAY = {
                washed: ['Washed means the fruit was taken off and the seeds fermented and rinsed clean before drying.', 'gimme-process'],
                natural: ['Natural means it dried whole, with the fruit still on.', 'gimme-process'],
                honey: ['Honey means the skin came off and some of the sticky fruit stayed on while it dried.', 'gimme-process'],
                'wet-hulled': ['Wet-hulled means the papery parchment was stripped off while the beans were still damp.', 'gimme-process'],
                anaerobic: ['Anaerobic means it fermented in sealed tanks with little oxygen.', 'cafeimports-anaerobic'],
                carbonic: ['Carbonic maceration means it fermented in tanks filled with CO2, an idea borrowed from winemaking.', 'rave-cm'],
                'kenyan-soak': ['Double fermented or "Kenya process" means the washed beans were soaked under clean water before drying.', 'barista-double'],
                lactic: ['Lactic means the ferment was steered toward lactic acid bacteria, the kind in yogurt.', 'pdg-lactic'],
                'thermal-shock': ['Thermal shock means the coffee was rinsed in hot, then cold water after fermenting.', 'ineffable-ts'],
                'co-ferment': ['Co-fermented or infused means something was added, like fruit or spice, so some of the flavor may come from it.', 'pdg-infused'],
                fermentation: ['Most washed coffee is fermented before it’s rinsed, so “fermented” doesn’t say how; it may point to a longer or special ferment.', 'cafeimports-anaerobic'],
                extended: ['Extended fermentation means it fermented for longer than usual.', 'coffeereview-anaerobic'],
                'swiss-water': ['Swiss Water decaf takes the caffeine out with water and carbon filters, no solvents.', 'koa-swp'],
                sugarcane: ['Sugarcane decaf uses ethyl acetate, a solvent also found in sugarcane, to take out the caffeine.', 'royalny-decaf'],
                'mountain-water': ['Mountain Water decaf works like Swiss Water, with water from Mexico’s mountains.', 'royalny-decaf']
            };
            function decode(bean, given) {
                const t = given || read(bean);
                if (t.tea) return '';
                const out = [];
                const o = t.origin, cs = o.countries.map(c => country[c]).filter(Boolean);
                const vs = t.variety.map(id => entry('variety', id)).filter(Boolean);
                const roast = ['light', 'medium', 'dark'].includes(t.roast) ? `${t.roast}-roasted ` : '';
                const roastTail = ['medium-light', 'medium-dark'].includes(t.roast) ? `, roasted ${t.roast}` : '';
                // first sentence: what it is and where it's from
                let what;
                const adj = cs.length === 1 && !o.blend ? cs[0].adj : '';
                if (vs.length === 1) what = `${adj ? `${adj} ` : ''}${vs[0].name}`;
                else if (vs.length > 1) what = `${adj ? `${adj} ` : ''}coffee of ${NUMW[vs.length] || vs.length} varieties`;
                else what = `${adj ? `${adj} ` : ''}coffee`;
                let where = '';
                if (cs.length === 1 && !o.blend) {
                    const r = o.region ? regions[`${cs[0].code}:${o.region}`] : null;
                    if (o.placeName && r) where = ` from ${o.placeName}, in ${r.name}`;
                    else if (o.placeName) where = ` from ${o.placeName}`;
                    else if (r) where = ` from ${r.name}`;
                } else if (cs.length > 1) where = `, a blend from ${andList(cs.map(c => c.name))}`;
                const article = /^[aeiou]/i.test(roast || what) ? 'An' : 'A';
                out.push(`${article} ${roast}${what}${where}${roastTail}.`);
                // the varieties, in a sentence each (ones that say the same thing share one)
                const said = new Map();
                vs.forEach(e => { const s = SAY[e.id]; if (!s) return; if (!said.has(s[0])) said.set(s[0], []); said.get(s[0]).push(e.name); });
                said.forEach((names, s) => out.push(`${andList(names)} ${names.length > 1 ? s.replace(/^is /, 'are ').replace(/^was /, 'were ').replace(/^comes /, 'come ').replace(/^means /, 'mean ').replace(/^went /, 'went ') : s}.`));
                if (t.species === 'arabica' && !vs.length) out.push(cs.length === 1 && cs[0].code === 'ETH' ? '“Arabica” is the species, not a variety. In Ethiopia that usually means local landraces or research-station selections.' : '“Arabica” is the coffee species; the bag doesn’t name the variety.');
                // the process: the base, then what's on top
                const p = t.process;
                if (p.base && PSAY[p.base] && !(p.layers.includes('kenyan-soak'))) out.push(PSAY[p.base][0]);
                p.layers.forEach(l => { if (PSAY[l]) out.push(l === 'fermentation' && p.base !== 'washed' ? '“Fermented” on its own doesn’t say how; nearly all coffee ferments a little on its way to the bag.' : PSAY[l][0]); });
                if (p.decaf && PSAY[p.decaf]) out.push(PSAY[p.decaf][0]);
                return out.join(' ');
            }

            // ---- the copy the server keeps (only for community numbers; phones always read the bag themselves)
            function store(bean) {
                const t = read(bean);
                if (t.tea) return null;
                const keep = bean && bean.learnKeep && typeof bean.learnKeep === 'object' ? Object.fromEntries(Object.entries(bean.learnKeep).filter(([k, v]) => ['variety', 'origin', 'process'].includes(k) && typeof v === 'string').map(([k, v]) => [k, String(v).slice(0, 80)])) : null;
                const s = { v: VERSION, variety: t.variety.slice(0, 8), origin: { countries: t.origin.countries.slice(0, 8), region: t.origin.region || null, place: t.origin.place || null, blend: !!t.origin.blend },
                    process: { base: t.process.base || null, layers: t.process.layers.slice(0, 8), decaf: t.process.decaf || null, added: !!t.process.added } };
                if (t.species && t.species !== 'arabica') s.species = t.species;
                if (keep && Object.keys(keep).length) s.keep = keep;
                return s;
            }
            // every id the server may store (it refuses others)
            function knownIds() {
                return {
                    variety: [...entries.values()].filter(e => e.kind === 'variety').map(e => e.id).concat(['744']).sort(),
                    species: [...entries.values()].filter(e => e.kind === 'species').map(e => e.id).sort(),
                    country: Object.keys(country).sort(),
                    region: [...new Set(Object.values(regions).map(r => r.id).concat(lines(PLACES).map(l => l[1]).filter(Boolean)))].sort(),
                    place: [...new Set(lines(PLACES).filter(l => (l[4] || '').includes('place')).map(l => squash(l[2])))].sort(),
                    process: Object.values(proc).filter(e => e.layer !== 'variant').map(e => e.id).sort(),
                    decaf: Object.keys(decafs).sort()
                };
            }
            // the kinds a coffee belongs to, for "You and X", the passport and the community numbers
            function kindsOf(t) {
                const k = [];
                t.variety.forEach(id => k.push(`variety:${id}`));
                if (t.species && t.species !== 'arabica') k.push(`species:${t.species}`);
                if (t.origin.countries.length === 1 && !t.origin.blend) k.push(`origin:${t.origin.countries[0]}`);
                if (t.process.base) k.push(`process:${t.process.base}`);
                t.process.layers.forEach(id => k.push(`process:${id}`));
                return k;
            }
            const allCountries = () => Object.values(country);
            const allVarieties = () => [...entries.values()].filter(e => e.kind === 'variety' || e.kind === 'species');
            const allProcesses = () => Object.values(proc).filter(e => e.layer !== 'variant');
            const regionsOf = code => Object.values(regions).filter(r => r.code === code);
            return { VERSION, norm, squash, read, field, decode, store, entry, knownIds, kindsOf, allCountries, allVarieties, allProcesses, regionsOf, processName, FAMILY, CONTINENTS, SRC, SAY, PSAY, readOrigin, readProcess, readVariety };
        })();
        if (typeof module !== 'undefined' && module.exports) module.exports = LearnEngine;

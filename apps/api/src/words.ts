import { isTurkishWord, normalizeWord } from '@arena/game-engine';

function parse(list: string): string[] {
  const words = list.trim().split(/\s+/u).map(normalizeWord);
  const malformed = words.filter(word => !isTurkishWord(word));
  if (malformed.length) throw new Error(`Kelime listesinde biçim hatası: ${malformed.join(', ')}`);
  return [...new Set(words)];
}

// Cevap havuzu günlük Türkçede kullanılan beş harfli kelimelerden oluşur.
export const answers = parse(`
  abone adres ahşap ahenk aktör albüm alıcı ambar armut aslan aşırı atlas avize ayran aygıt
  badem bagaj bahçe bahar bakır balık balon balta bamya baraj barış basit baskı
  bıçak biber biçim bilet birim bitki boyun bozuk böcek bölge burun bütün
  cevap ceviz civar çabuk çadır çakıl çamur çanak çanta çarşı çatal çayır
  çelik çeşit çevre çiçek çilek çimen çizgi çocuk çorap çorba çubuk
  dalga damar damla darbe değer demet demir deniz dergi devir diken dilim
  dolap dolgu doruk dosya döküm durak durum duvar düğüm dünya dürüm düşüş düzen
  ekran elmas elyaf emlak emsal erzak evrak ezber fidan fikir filiz final firma fişek
  folyo funda garaj gazoz gelin genel geyik göbek gölge gövde güneş gurur güven güzel
  hafif hakem halat hamur hamsi hasat hasır hatır havlu havuç hayat hazır
  hekim hesap heves hırka horoz hukuk huzur hüner ırmak ıslak iddia ikili iklim imdat
  insan iplik istek işgal işlek joker kabak kabin kablo kabuk kadar kadro kahve
  kalıp kalem kalın kanat kanıt kapak kaput karar karga kasap kaşık katır katık
  kavak kavun kayak kayık kayıt kazak kazan kebap keder keman kemer kepçe keser
  kesin kılıç kıraç kızak kibar kireç kitap koçan kolay konak konuk kopuk korku kovuk
  koyun köfte köken köpek köprü köpük kömür kural kurgu kusur kutup küçük kümes kürek küvet
  lamba liman limon lokma lodos lüfer lütuf madde makas maket mango martı masal
  maske medya melek merak metal meyve mısır midye miras model modem moloz motor
  müzik nadir nakit narin nazik neden nefes nehir nesil nesne nezle ninni nokta
  noter obruk odacı ofset oğlak oksit olası olgun omlet opera orman ortak otlak
  önlem ördek örgüt örnek özlem paket palet pamuk panel pazar perde peron pilot pipet plaza polar polis
  posta poşet pudra pütür radyo rakam raket rakip ralli rampa reçel rehne rende
  ritim robot roket roman rozet sabah sabır sabun saçak safir sahil sahip sakin sakız
  saksı salon saman sanat sanal sapak saray sargı sayfa saygı sebep sedef sefer
  sehpa selam semer serçe sergi serin sepet sevda sevgi seyir sıcak sıfat sınav
  sınıf sırık simit sinir sinek sivil sofra sokak soket soluk somun sonuç sosis soğan
  soyut söğüt sönük sözcü sözel sürgü sürme sürüm sütun süzge şafak şahıs şahit
  şekil şeker şerit şehir şifre şirin şoför şurup tabak taban tablo tahin takım
  takla takoz taksi talep talim tamam tamir tango tavan tavuk tayin tekel temel
  tempo teras terim terzi teyit tıkaç tımar tıraş tilki tokat tomar tonik topak
  topuk torba tozlu tören tuhaf tulum turşu tutam tutku tuzak tünel tüplü türev
  uğrak uğraş unsur unvan urgan usanç uygar uygun uysal ücret ünlem üreme ürkek
  üslup üzeri vakit vakum valiz varil varış vatoz vergi verim vezir video viraj
  virüs vişne vizon vuruş yafta yağcı yağış yağlı yakıt yalan yalın yamaç yamak
  yanık yapay yaren yarış yasak yasal yaşam yatak yatay yavaş yavru yayla yazar yazım
  yazın yazıt yedek yelek yenge yerel yeşil yetim yetki yıkım yılkı yılan yiğit
  yirmi yoğun yokuş yonga yorum yosun yudum yulaf yumak yumru yunus yutak yutma
  yüzey yüzük yüzüş zafer zayıf zehir zemin zerre zihin zirve zulüm zümre
`);

// Genişletilmiş tahmin listesi Zemberek-NLP ana sözlüğünden derlenmiştir.
// Kaynak, değişiklikler ve Apache-2.0 lisansı için apps/api/licenses/zemberek dizinine bakın.
export const accepted = new Set([...answers, ...parse(`
  abaşo abdal abece abide abiye ablak abosa abraş abuli acaba acele acemi
  aceze acılı acibe acube acuze açgöz açlık açmak açmaz adale adalı adamı
  adese adeta adına afaki afazi afife afişe afoni afsun afşar aftos afyon
  agami agora agraf ağlak ağmak ağnam ağraz ağyar ahali ahbap ahcar ahfat
  ahize ahlaf ahlak ahlat ahmak ahraz ahval aidat ajans ajite akabe akait
  akaju akala akbaş akçıl akdut akemi akide akkor akkuş aklan aklen aklık
  akmak akman akmaz akont akort akpas akran akrep aksak aksam aksan akson
  akşam akşın aktar aktif akvam alaca alaka alarm alaza albay alçak aleni
  aleyh algın alize alkan alkım alkış alkil alkol allak allem allık almaç
  almak almaş almış alnaç altes altık altın altız altlı alyan alyon amade
  amber amele amfor amigo amorf amper ampir ampul amudi anaca anane ancak
  andaç andıç andık andız anele anemi angıç angın angut anime anjin anket
  anlak anlam anlık anmak anons anten antet antik antre anüri anyon apacı
  apiko aplik aport apoşi apotr april apron apsis aptal araba aracı arada
  araka aralı arama arazi ardak ardıç ardıl arefe arena argaç argın argıt
  argon arıcı arıza arızi arife ariya ariza arkaç arkıt arkoz armuz aroma
  arpçı arpej arsız arşın arşiv artçı arter artık artım artın asabi ashap
  aside asist asker aslen asmak aspur astar astat astım astik asude asyön
  aşağı aşama aşevi aşina aşkın aşmak aşure atağı atama atari ataşe atfen
  atıcı atılı atlet atmak atmık attar avane avans avara avare avdet avgın
  avlak avrat avret avşar avunç avurt aydın ayevi aygır ayırt aylak aylık
  aymak aymaz aynaz aynen ayraç ayrıç ayrık ayrım ayrıt aysar ayvan ayvaz
  ayyar ayyaş ayyuk azade azami azgın azize azlık azmak azman aznif azoik
  azvay babaç bacak badal badas badat badıç badik badya baget bağan bağcı
  bağıl bağım bağın bağır bağış bağıt bağlı bahir bahis bahri bakaç bakam
  bakan bakım bakış bakir bakla bakma balak balar balat balcı baldo balet
  baliğ balkı baloz balya bambu banak banal banço bando banjo banka banko
  banyo barak baran barba barça barda bardo barem baret barit bariz barka
  barok baron barut basak basar basen basık basım basın basış basil basma
  basso bastı basur basya başak başat başka başlı başta batak batar batık
  batıl batın batış batik batkı baton batur bavul bayan bayat bayır bayrı
  bazal bazan bazen bazik bazit bebek becet bedel beden bedii bedik bedir
  bedük begüm beher behey behre bekar bekas bekçi bekri belce belde belek
  belen beleş belge belgi beliğ belik belit belki belli bemol bence benci
  bende benek bengi beniz berat beril besin beste beşer beşik beşiz beşme
  beşon beşuş beter betik betim beton beyan beyaz beyin beyit beyti bezek
  bezen bezgi bezik bezir bıcıl bıcır bıçık bıçkı bıdık bıyık bızır biblo
  bicik biçem biçki biçme bidar bidat bidon bihuş bijon bikes bikir bilar
  bilek bilge bilgi bilim bilir biliş bilme bilye bindi binek biner bingi
  biniş binit binme biraz birer birey birun bişek bitap bitek bitey bitik
  bitim bitli bitme bitüm biyel bizar bizce bizim bizon bloke bobin bocuk
  boduç bodur boğak boğaz boğma boğuk boğum bohça bohem bolca bomba bombe
  borak boran borat borda bordo borik borsa boruk boslu boyar boyca boylu
  boyna boyoz boyut bozca bozma bozum bozun böbür böğür bölen bölme bölük
  bölüm bölüş bölüt bönce börek börtü böyle branş bravo bronş bronz bröve
  bucak buçuk budak budun bugün buğra buğur buhar buhur buket bukle bulak
  bulgu bulma buluş bulut bunak bunca bunlu burcu burgu burma buruk butan
  butik butil buton buyot buyur buzcu buzla buzlu buzul bücür bücüş büğet
  büğlü büken bükme büküç bükük büküm bükün büluğ bünye bürgü bürük bürün
  büstü bütan bütçe büten büvet büyük büzgü büzük cacık cadde cahil caize
  calip camız camia camit camlı canan canım canip canlı carta casus cayır
  cazcı cazır cazip cebel cebin cebir cebri cedit cedre cehil cehit cehre
  cehri ceket celal celbe celep celil celse cemal ceman cemil cemre cenah
  cenap cenin cenup cepçi cephe cepli ceren ceset cesim ceste cesur cetin
  cevaz cevir cevri cevvi cezai cezbe cezir cezve cıbıl cıcık cılız cıvık
  cıvıl cıyak cızık cızır cibin cibre cicik cicim cicoz cidal cidar ciddi
  ciğer cihan cihar cihat cihaz cihet cilve cimci cimri cinai cinas cinci
  cinsi cirim cirit cisim civan ciyak cizye conta corum coşku coşma coşuş
  cubur cudam cukka cumba cunda cunta cuşiş cübbe cücut cücük cülus cümle
  cünha cünun cünüp cüppe cüret cüruf cürüm cüsse çağır çağla çağrı çakal
  çakar çaker çakım çakın çakır çakış çakma çakra çalak çalan çalap çalar
  çalgı çalık çalım çalkı çalma çaltı çamat çamça çamlı çancı çandı çanlı
  çapak çapar çaplı çapma çapul çaput çarık çarka çarkı çarpı çasar çaşıt
  çatak çatık çatır çatkı çavun çavuş çayan çaycı çaylı çebiç çecik çedik
  çehre çekek çekel çekem çeker çekiç çekik çekim çekiş çekme çekül çelek
  çelen çelgi çelim çello çelme çemçe çemen çemiç çenek çenet çengi çepel
  çeper çepez çepin çerağ çerçi çerez çerge çeşme çeşni çetin çevik çevir
  çevri çeyiz çıban çıdam çıfıt çığır çıkak çıkar çıkık çıkın çıkış çıkıt
  çıkma çıkra çıktı çılan çınar çıngı çıpak çıpır çırağ çırak çırpı çıtak
  çıtır çıyan çifte çiğde çiğin çiğit çilli çimek çince çinko çinti çipil
  çiriş çiroz çisli çişik çiten çitli çitme çivit çizer çizge çizik çizim
  çiziş çizme çoban çoğul çoğun çokal çokça çolak çolpa çoluk çomak çomar
  çopra çopur çorak çorlu çotra çotuk çöğür çökek çökel çökme çökük çöküm
  çöküş çömçe çömez çömme çöpçü çöplü çörek çörkü çörtü çöven çözgü çözme
  çözük çözüm çözüş çukur çulcu çulha çupra çuşka çutur çuval çükür çünkü
  çürük çütük dadaş dağar dağcı dağlı dahil dahli daima daire dakik dalak
  dalan dalaş daldı dalgı dalış dalız dalya damak damat damga damıt daraç
  daraş dargı darıl dasit datif davar davet davul davya dayak debbe debil
  defin defne degaj değeç değil değim değin değme deist deizm dekan dekar
  dekor delgi delik delil delim delta demci demeç demek demin demli denek
  denet deney denge dengi denim denli dense denyo depar derbi derin derli
  derme derse derun derya desen deste desti deşik detay devam devim devre
  deyim deyiş dığan dılak dışık dışkı dışlı dibek didar didik didon diğer
  dikeç dikey dikim dikiş dikit dikiz dikme dikse dikta dikte dilek dilli
  dilme dimağ dinar dince dinci dinek dinen dingi diniş dinme dipli direk
  diren direy diriğ diril dirim diriş disko dişçi dişil dişli dival divan
  divik divit diyar diyet diyez diyot dizek dizel dizem dizey dizge dizgi
  dizim dizin diziş dizme dobra dogma doğaç doğal doğan doğdu doğma doğru
  doğum doğuş dokuz dolak dolam dolan dolar dolay doldu dolma dolum doluş
  domur domuz donam donan donma donör donra donuk dorse dorum doygu doyma
  doyum dozaj dozer döken dökme dökük dölek dölüt döneç dönek dönel dönem
  döner döngü dönme dönük dönüm dönüş dönüt döşek döşem döveç döven döviz
  dövme dövüş draje drama drene dubar duble dudak duhul dulda duluk duman
  dumur duraç dural durdu durgu durma duruk duşak duşlu duvak duyar duygu
  duyma duyum duyuş dübel dübeş düçar düden düdük düğme düğün dümen dünit
  dünkü dünür dürme dürtü dürzü düşes düşeş düşey düşkü düştü düşük düşüm
  düşün düşüt düvel düven düver düyek düyun düzce düzeç düzem düzey düzgü
  düzme ebcet ebleh ecdat eçhel edalı edebi edici edinç edvar efdal efece
  efekt eflak efrat efriz efsun efsus eften egale eglog egzoz eğili eğimi
  eğlek eğmeç eğmek eğrez eğrim ehram ehven ejder ekili eklem ekler ekmek
  ekose eksen ekser eksik eksin eküri elbet elçek elçim elden eleji elele
  elgin elhak eline elips elleç ellik elmek elvan elzem emare emaye emcek
  emcik emici emlik emmeç emmek emraz emtia emval emzik enayi encam endam
  ender eneze enfes engel engin enine enkaz enlem enöte ensar ensiz entel
  enzim eosen epeyi epope erbap erbaş erbin erdem erden ergen ergil ergin
  erika erime erinç erişi erkan erkeç erkek erken erkim erkin ermek ermin
  eroin ervah erzel esame esans esası esasi esbak esbap eseme esham esire
  eskiz eslaf eslek esmek esmer esnaf esnek espas espri esrar esrik essah
  estek ester estet esvap eşarp eşhas eşkal eşkin eşlek eşlem eşlik eşmek
  eşraf eşref eşsiz etçil etene etken etkin etlik etmek etmen etnik etraf
  evaze evcek evcil evdeş evgin evham eviye evkaf evlek evlik evrat evren
  evrik evrim evsaf evsin evsiz evvel eylem eylül eytam eyvah eyvan eyyam
  ezgiç ezgin ezinç ezmek facia fagot fahiş fahri fahte fahur fakat fakır
  fakih fakir fakül falan falcı falez falso falya fanta fanti fanus fanya
  faraş farba fariğ faril farta farzı faset fasıl fasih fasit faska fason
  fatih fauna fayda fazıl fazla fecir fehim fehva fekül felek fenci fener
  fenik fenni fenol ferağ ferah ferda ferde ferdi ferih ferik ferli ferma
  fesat fesih fetha fetih fetiş fetüs fetva fevri feyiz fıkıh fıkır fıkra
  fırça fırıl fırın fırka fısıl fısır fışır fışkı fıtık fiber fidye fifre
  figan figür fiili fikri filan filar filet filoz filum finiş firak firar
  firez firik fiske fisto fişka fitil fitin fitne fitre fiyat fizik flama
  fleol flirt flora flori flöre flört flüor fodla fodra fodul fokur fokus
  fonda fonem forma foroz forsa forte forum forza fosil fosur frank frape
  frenk fresk freze fribo frigo frisa fuaye fuhuş fujer fular fulya furta
  furya fuzul fücur fülüs fünun fünye füsun fütur füzen gabin gabro gabya
  gacır gadir gafil gafur gaile gaita galat galip galiz galon galoş gamba
  gamet gamze garaz garez garip garoz gasıp gasil gaşiy gauss gavot gayda
  gayet gayrı gayri gayur gayya gazal gazap gazel gazup gazve gebeş gebre
  geçek geçen geçer geçim geçit gedik gelen gelir geniş geniz genom geoit
  gerçi gereç gerek geren gergi geriz getto geven geviş geyşa gıcık gıcır
  gıdık gıdım gıpta gırla gıyap gider gidon giray girdi girim giriş gitar
  giyim giyit giysi gizem gizil gizli gnays gocuk godoş gonca goril gotik
  göbel göcen göçer göçük göçüm göden gödeş göğem göğüs gökçe gölek gölet
  gömme gömük gömüt gönen gönül gönye görev görgü görüm görüş götün gövek
  gövel gövem göyük gözcü gözde gözer gözgü grado grena grizu grosa guano
  guard guatr gucur gudde guguk gulet gurup gusto gusül gübre gübür gücük
  gücün güçlü güdek güdük güdüm güfte güğüm güleç gülle gülük gülüt gümeç
  gümül gümüş günah günce günde güneç güney güreş güruh gürül güveç güvey
  güvez güzaf güzey güzün habbe haber habip habis hacet hacim hacir haciz
  hadde hadım hadim hadis hafız hafit hafta haham hahha haile hakan hakim
  hakir halay halef halel halet halfa haliç halik halim halis halka haluk
  hamak hamal hamam hamız hamil hamiş hamle hamse hamut hanay hande hanek
  hangi hanım hanut hapaz hapır hapis hapşu hapur haraç haram harap harar
  harbe harbi harem harıl harım harın hariç harim harir haris harta hasar
  hasep haset hasıl hasım hasis haspa hassa hasse hasta hasut haşat haşıl
  haşır haşin haşir haşiş haşiv hatıl hatif hatim hatip hatmi hatta hatun
  havan havas havil havra havut havuz havya havza hayal haybe hayda haydi
  hayfa hayıf hayır hayıt hayız hayli hayta hazan hazar hazık hazım hazın
  hazin hazne hecin hedef heder hedik helik helis helke helme helva hemen
  hempa hemze henüz hepsi herek herif herik hertz herze heybe heyet hezel
  hıdiv hıfız hımış hırbo hırıl hırtı hısım hışıl hışım hışır hıyar hızar
  hızla hızlı hicap hicaz hiciv hidiv hidra hikem hilat hilye himen hindi
  hippi hisar hisse hitam hitan hitap hizip hodan hodri hokey hokka homur
  hoppa horon horst horul hoşaf hoşur hotoz hoyuk hozan hödük höpür höyük
  hudut hulul hulus hulya humar humma humor humus hupur hurda hurma hurra
  huruç husuf husul husus husye hutbe hutur hutut hücre hücum hüküm hülle
  hülya hünsa hürle hürya hüsün hüzme hüzün ığrıp ıhmak ıkına ılgar ılgım
  ılgın ılgıt ılıca ıltar ırgat ıskat ıslah ıslık ısrar ıssız ıstar ışkın
  ıştır ıtlak ıtrah ızgın ızrar ibare ibate iblis ibraz ibret ibrik ibzal
  icbar icmal içeri içiiş içkin içlem içmek içrek içten içyüz idare ideal
  idman idrak idrar ifade iffet ifham ifrağ ifrat ifraz ifrit ifsat iftar
  iğdiş iğfal ihale ihata ihbar ihdas ihmal ihraç ihram ihraz ihsan ihsas
  ihtar ihvan ihzar ikame ikbal ikdam ikmal ikona ikrah ikram ikrar ikraz
  iksir ilbay ilenç ileri ileti ilgeç ilhak ilham ilhan ilkah ilkel ilkin
  illet ilmek ilmik ilzam imale imame imbat imbik imece imleç imlek imren
  imsak inanç incik incir indis infak infaz ingin inmek insaf inşat intaç
  intak intan inzal ipeka ipham ipnoz ipsiz iptal ipucu irade irfan irite
  irmek irmik ironi irsal irsen irşat isale ishal islim ismen ismet isnat
  ispat ispir ispit israf istem ister istif istim istop isyan işkil işlem
  işlev işlik işmar işret iştah işteş işyar itaat iteği ithaf ithal itham
  itina itmam itmek ivedi ivesi ivmek izabe izafe izale izhar izlek izlem
  izole izzet jakar jarse jeloz jeton jikle jilet jokey jüpon kaban kabız
  kabil kabir kabul kabza kaçak kaçar kaçık kaçta kadeh kadem kader kadın
  kadim kadir kadit kadük kafes kağan kağnı kahır kahir kahpe kaide kaime
  kakaç kakao kakıç kakım kakır kakma kakum kalak kalas kalay kalça kalfa
  kalıç kalım kalıt kalya kamçı kamer kamet kamga kamış kamus kanal kanca
  kanık kaniş kanka kanon kanto kanun kapan kapik kapuz kargı kargo karha
  karık karın karış karma karne karni karst karşı karye kasem kaset kasık
  kasım kasır kasıt kasis kasko kasnı kaşan kaşar katar katım katil katkı
  katot katre katur kavaf kaval kavas kavat kavga kavil kavim kavis kavkı
  kavuk kavut kavuz kayaç kayan kayar kaygı kayın kayıp kayır kayış kayme
  kayra kayşa kazaz kazık kazıl kazım kebir kebze kefal kefek kefen kefil
  kefir kefne kehle kekeç kekik kekre kelek kelem kelep keler keleş kelik
  kelle kemal kemha kemik kemre kenar kendi kenef kenet kepek kepez kepir
  kerde kerem keres kerih kerim keriz kerki kerte kerti kesat kesek kesel
  kesif kesik kesim kesir kesit keski kesme kesre keşen keşif keşik keşiş
  keşke keşki ketal keten keton ketum kevel keven keyif kıble kıdem kıdım
  kıkır kılgı kılıf kılık kılır kılış kımıl kımız kıpık kıpır kıran kırat
  kıray kırba kırcı kırık kırım kırın kırkı kırma kısas kısık kısım kısır
  kısış kısıt kıska kıskı kıssa kışın kışır kışla kıtal kıtık kıtır kıvam
  kıvıl kıvır kıyak kıyam kıyas kıygı kıyık kıyım kıyın kıyma kıyye kızan
  kızıl kibir kifaf kiler kilim kilit kiliz kilüs kimse kimüs kimya kinci
  kinik kinin kiniş kiraz kirde kirik kiriş kirpi kirve kisve kitin kitle
  kitre kizir klima klips klişe koala kobay kobra koçak kodes kodoş kofra
  kofti koful koğuş kokak koket kokoş kokot kokoz kolan kolcu kolej kolik
  kolit kolon kolpo kolye kolza komar kombi komik komot komşu komut komün
  kondu konik konje konsa konum konur konut kopal kopça kopek kopil kopoy
  kopuz kopya koral korna korno korse korte koruk korun korza koşaç koşam
  koşin koşuk koşul koşum koşun koşut kotan koton kotra kovan kovcu koyak
  koyar koyut kozak köçek köhne kömbe kömeç kömüş körpe körük kösem kösnü
  köşek kötek kramp krank kravl kredi krema kriko kroki kroşe kubat kubbe
  kubur kucak kudas kuduz kudüm kukla kulaç kulak kulis kulun kulüp kumar
  kumaş kumla kumru kumuç kumul kunda kupes kuple kupon kupür kurak kuram
  kurca kurna kuron kurul kurum kuruş kurut kurya kurye kuşak kuşçu kuşet
  kuşku kutan kutlu kutnu kutur kuver kuvöz kuvve kuytu kuyum kuyut kuzen
  kuzey kuzin kübik küflü küfür kükre külçe külek külot külte küncü künde
  künye kürar kürit kürsü küskü küspe küsuf küsur küşat küşne küşüm kütin
  kütle kütük kütür laçın laçka laden lades ladin lafız lagar lagos lagün
  lağım lağıv lahit lahos lahut lahza lakap lakin lakoz lamel lando lanet
  lanoz lanse largo larva laski lasta latif lavaj lavaş lavta lavuk layık
  lazer lazım lazut leçek ledün legal leğen lehçe lehim lemis lenfa lento
  lepra lerze levha levye lezar leziz lıkır libas liboş libre lider light
  liken likit likör limbo limit linet linin lipit lipom liret lirik lisan
  liste litre livar lizol lizöz lobut logos lojik lokal lokum lonca longa
  lopur lorta lotus lökoz löpür lügat lügol lümen lünet lüzum maada mabat
  mabet mabut macun madam madem maden mader madik madun mafiş mafya magma
  magri mahal mahfe mahfi mahıv mahir mahna mahra mahur mahut mahya maile
  majör makak makam makat makro maksi makta maktu makul malak malaz malca
  malen malik malul malum malya mambo mamul mamur mamut manas manat manav
  manca manda manej manen manga mantı manti manto manya mapus maral maraz
  marda mariz marka marke marki maron maruf marul maruz marya masaj masat
  masif masnu mason masör masöz mastı masum masun maşer maşuk matah matbu
  matem matiz matla matuf matuh maval maviş mavna mavra mayın mayıs mayna
  mazak mazot mazur mebde mebiz mebni mebus mecal mecaz mecmu mecra medar
  medet medih medüz meful meğer mehaz mehel mehil mehle mekik melal meles
  meleş melez melik melon melul melun melül memat memba memnu memul memur
  menfa menfi menşe menus meral meram merci merek meres meret mermi mesai
  mesaj mesel mesen meses mesmu mesul mesut meşbu meşin meşru meşum metan
  metbu metil metin metis metot metre metro mevdu mevki mevta mevut mevzi
  mevzu meyal meyan meyil meyus mezar mezat mezon mezra mezru mezun mezür
  mezzo mıcır mıgri mırıl mırın mırra mısra mışıl miçel mikoz mikro milel
  milim milis milli mimar mimik minik minör miraç mirat mirim mirza misak
  misal misel misil misis mitil mitos mitoz miyar miyav miyaz miyom miyop
  mizaç mizah mizan mobil modül moher molas molla monat monte mopet moral
  moren morto moruk motel motif mouse mozak möble mösyö muare mubah mucip
  mucir mucit mucuk mucur mudil mufla muhal muhat muhik muhil muhip muhit
  mujik mukim mukni mukus mumya munis murat muris musap musır muska muson
  muşta muştu mutaf mutat mutlu muylu muzır muzip muzur mübah müdür müfit
  müftü mühim mühre mühür müjde mülga mümas mümin münşi mürai mürit mürur
  müşir müziç nabız nacak naçar naçiz nadan nadas nadim nafıa nafiz nafta
  nağme nahak nahır nahif nahiv nahoş nakıs nakış nakız nakil nakip nalan
  nalça nalın namaz namlu namus nanay nanik nasıl nasıp nasır nasip nasir
  naşir natır natuk natür nazal nazar nazım nazır nazil nazir nebat nebze
  necat necip nedbe nedim nefer nefha nefir nefis nefiy nehiy nekes nekre
  neler nesep nesiç nesih nesim nesir neşet neşir nevir neyçe neyse nezif
  nezih nezir nısıf nicel niçin nifak nihan nikap nikel nimet nipel nisan
  nisap nişan nitel niyaz niyet nizam nodul nodül nohut nokra nonoş notam
  nöbet nöron nukut numen nutuk nüans nüfus nüfuz nükte nükul nüsha nüzul
  oberj odeon ofans oflaz ofris oğlan okapi oktan oktav okume olçum oleik
  olein olmak olmaz ombra ongen ongun oniks onmak onmaz oosit optik oranı
  oraya orfoz organ orkit orlon ortaç ortam ortay ortez ortoz otacı otçul
  otist otizm otluk otsul ovmaç ovmak oydaş oyluk oylum oymak oynak oynaş
  ozmos ozuga ödlek ödünç öğlen öğrek öksüz ölçek ölçer ölçüm ölçün ölçüt
  ölgün ölmek ölmez öncel öncül önder öneri öneze önlük öpmek örcin öreke
  örgen örgün örmek örtük öteki ötmek ötürü övmek övünç özdek özden özdeş
  özenç özeni özerk özgül özgün özgür öznel pabuç paçal paçoz padok pafta
  pagan pahal palan palas palaz palto pampa panda panik papak papaz papel
  paraf parça parıl parka parke parpa parsa parti parya pasaj pasak pasif
  pasör pasta patak paten patır patik patis patoz payam payan payda payen
  payet pazen peçiç pedal peder pelin pelit pelte pelür pelüş pembe pençe
  penes pengö penis pense penye peren perki perma permi peruk perva pesek
  pesüs peşin petek peyda peyke pıhtı pınar pırıl pırpı pırtı pıtır pikaj
  pikap piket piliç pilli pinel pines pinti pirit pisik pisin pişek pişik
  pişim pişti piton piyan piyaz piyes piyon pizza plaka plase plato plise
  pofur poker pokus polat polen polim polip polka pomat pompa ponje ponza
  porno porte porto potas potin potuk potur pound poyra pöçük prafa prens
  prese print proje prova pruva puluç pumba punto pusat puset püfür pünez
  püren pürüz püskü püsür rabıt racon radar radde radon rafit rafya ragbi
  rahat rahim rahip rahle rahne rakım rakik rakit rakor ramak randa ranza
  rapor rasat rasıt raspa rasyo ratıp raunt rayba rayiç reaya rebap recep
  recim redif refah refik refüj rehin rejim rekiz rekor remel remil remiz
  resen resif resim resul reşit reşme revaç revak revan revir reviş reyon
  rezil rızık rical ricat rijit rimel ringa riyal rodaj rodeo rosto rotil
  rotor röfle rögar rötar rötuş ruble rugan rugbi ruhen rulet rumba rumuz
  runik rutin rübap rüesa rükün rüküş rüsum rüsup rüsva rütbe rüyet saban
  sabık sabit sabuh sabuk sabur saçık saçma sadak sadet sadık sadır sadik
  safer safha safra sagar sağcı sağım sağın sağır sağrı sahaf sahan sahih
  sahne sahra sahre sahte sahur saika sakaf sakak sakal sakar sakat sakın
  sakır sakıt sakil sakim sakit saklı salak salam salaş salça salep salgı
  salık salım salim salip saloz salpa salsa salta salto salvo salya samba
  samsa samur samut sancı sanem sangı sanık sanki sanrı sapan sapık sapır
  sapkı saraç sarak sarat sarık sarım sarig sarih sarma sarpa saten satıh
  satım satır satış satir sauna savak savan savaş savat savcı sayaç sayha
  sayım sayın sayrı sazak sazan seans sebat sebil sebze secde seçal seçik
  seçim seçki sedir sedye sefih sefil sefir seher sehim sehiv sekel sekil
  sekiz seksi sekte selef selek selen selim selis selva selvi semah seman
  semen semih semiz senek senet senir senit sepek sepya serak serap seren
  serim seriş serum servi sesçi sesli seter setik setir setre sevap sever
  sevim seyek seyis seyit sezgi seziş sezon sıçan sıfır sığır sığla sıkça
  sıkım sıkıt sımak sındı sınık sınır sırat sırça sırım sırlı sırma sıska
  sıtma sıvık sıyga sıygı sızak sızım sibak sicil sicim sidik sifin sifon
  sigar siğil sihir sikke silaj silgi silik silis silki sille silme simge
  simya sinik sinle sinsi sinüs siper sipsi siren sirke sirmo siroz sirto
  sitem sitil sivri siyah siyak siyek siyer skala skink slayt softa soğuk
  sokra sokum sokur solak solcu somak somon somut somya sonar sonat sonda
  sonlu sonra sorgu sorit sorti sorum sorun soyka soylu söğüş sökel sökük
  söküm sökün sölom sönüm söven sövgü söyle sözde sözlü spazm sperm sprey
  stant start statü steno stent stilo streç stres suare subay subra subuk
  subye sucuk sucul suçlu sudak sudan sufle sukut sulak sulta suluk sumak
  sumen sunak sungu sunta sunum sunuş suoku supap surat suret susak susam
  susku susta susuz suvat suyuk sübek sübut sübye sücut sükse sülük sülün
  sülüs sümek sümen sümük süngü süper sürat süreç sürek sürfe sürre sürur
  süsen süslü sütlü sütre süven süyek süyüm süzek süzgü süzük şaban şaful
  şahap şahım şahin şahne şahsi şaibe şaire şakak şakır şakul şalak şaman
  şamar şamil şapel şapır şapka şarap şarıl şarkı şarpi şaryo şaşaa şataf
  şatır şavul şayak şayan şayet şayia şayka şebek şedde şedit şefik şehit
  şekel şekva şelek şemse şepit şeran şeref şerha şerif şerik şerir şetim
  şıkır şınav şıpır şıpka şırak şırıl şifon şilem şilep şilin şilte şimal
  şimdi şinik şişek şişik şişko şopar şoset şoson şoven şölen şömiz şöyle
  şuara şubat şukur şupur şükür şümul şüphe tabip tabir tabla tabur tabut
  tabya tacil tacir taciz tadat tadım tadil tafra tafta tahıl tahra tahta
  taife takas takat takık takır takim takip takke taksa takti takva talan
  talaş talaz talih talik talil talip tamah tamik tamim tanen tanık tanım
  tanış tanıt tanin tanrı tapan tapır tapir tapon taraf tarak taraş taraz
  taret tarım tarif tarih tarik tariz tarla tartı tasar tasdi tasım tasma
  tasni taşak taşıl taşım taşıt taşra tatar tatil tatlı tavaf tavır tavik
  taviz tavla tavus tayfa tayga tayın tayip tazim tazip taziz teali teati
  tebaa teber tecil tecim tedai tedip tefek teğet tehir teist teizm teker
  tekil tekin tekir tekit tekke tekme tekne tekst telef telek telem teles
  telif telin telis telve temas temek temin temiz tenge tenha tenis tenor
  tente tenya teori tepik tepir tepke tepki tepsi terbi terek teres terfi
  terki terme terör tesir tesis tesit tesri testi teşci teşne teşri teşyi
  tetik tetir tevdi tevek tevil tevki tevsi tevzi teyel teyze tezat tezek
  tıfıl tıkım tıkır tıkış tıkız tınaz tıpır tıpış tıpkı tırak tırık tırıl
  tırıs tifüs tikel timüs tiner tipik tiraj tiran tirat tiril tirit tiriz
  tirle tirsi tirşe titan titiz tohum tokaç tokuş tokuz tokyo tolga tomak
  tonaj toner tonga tonla tonoz topaç topal topar topaz topik toplu topur
  toput topuz torak torik torna tortu torum torun tosun total totem toyga
  tozan tökez törel törpü tövbe tözel trafo trake trans tranş trata trend
  trias triko tromp tröst tufan tugay tuğla tuğra tukur tuluk tulup tuman
  tumba tunik turaç turba turbo turfa turna turne turno turta tutaç tutak
  tutar tutuk tutum tutya tuval tuyuğ tuzla tüfek tüken tümce tümel tümen
  tümör tümür tünek türap türbe türel türkü türlü türüm türüz tütsü tütün
  tüvit tüzel tüzük tvist ucube uçarı uçkun uçkur uçmak uçman uğrun uknum
  ulema ulufe umacı ummak umman usare uskur uşkun uşşak utanç utmak uyarı
  uyluk uymak uymaz uyruk uzlaş uzlet uzman üçgen üçgül üçler üçtaş üdeba
  üfleç üğrüm ülfet ülger ülser ümera ümmet ümran ündeş ünite üremi üryan
  üsera üsküf üstat üstel üstün üşenç üşmek ütmek üzere üzgün üzmek üzünç
  vacip vagon vahim vahit vahiy vakar vakfe vakıa vakıf vakur valör vapur
  varak varan varda vargı varis varit varoş varta vasat vasıf vasıl vaşak
  vatan vatka vazıh vebal vecih vecit veciz veçhe vedia vefat vehim vekil
  velet velev velur velut verdi verem verev verit vezin vezne vıcık vızıl
  vızır viral viran visal viski vites vitir viyak viyol vizör vokal volta
  vonoz votka voyvo vukuf vulva vuraç vurgu vuruk vusul vuzuh vücut vürut
  vüsat yaban yabgu yağır yağız yağma yahey yahni yahşi yahut yakar yakım
  yakın yakin yakut yalak yalap yalaz yalım yalız yalpa yalpı yaman yamru
  yamuk yanak yanal yanay yanaz yangı yanıt yankı yanlı yansı yapak yapık
  yapım yapıt yarak yarar yarda yargı yarık yarım yarın yarka yarma yaslı
  yassı yaşıt yatık yatım yatır yatsı yatuk yavan yaver yavsı yavuz yayan
  yaygı yayık yayım yayın yazgı yazık yazma yediz yeğen yeğin yeğni yekta
  yeleç yelin yelve yemek yemin yemiş yengi yenik yerey yergi yerli yeşim
  yeter yetik yetke yeygi yezit yığın yıkık yılgı yılık yırık yirik yitik
  yitim yiyim yobaz yokla yoksa yokum yolak yolcu yollu yoluk yonca yontu
  yorga yortu yosma yörük yufka yukaç yular yumuk yunak yurdu yutum yuvak
  yuvar yuvgu yüklü yüküm yülgü yülük yürek yürük yüsrü yüzde yüzer zabıt
  zabit zağar zahir zahit zalim zaman zamir zamme zanka zanlı zarar zarif
  zarta zaten zeban zebra zebun zecir zefir zehap zeker zelil zelve zenci
  zenne zerde zeval zevat zevce zeyil zıbın zımba zıpır zıpka zırva zıvır
  zifaf zifin zifir zifos zigon zigot zihaf zikir zinde ziyan zloti zombi
  zorba zorgu zorla zuhur zurna zübde zühul zülüf züppe zürra züyuf
`)]);

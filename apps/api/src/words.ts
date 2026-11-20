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

export const accepted = new Set([...answers, ...parse(`
  abdal acemi acılı acube açgöz açlık açmak açmaz adale adalı adeta afsun afyon
  ahali ahbap ahmak ahval ajans akbaş akçıl aklık akmak akort akran akrep aksak
  aksam aksan akson aktar alaca alaka alarm albay aleni alkım alkış allık almak
  almış altın altlı alyan amade amper ampul amudi anaca anemi anmak anons anten
  antre apacı apron aptal araba aracı arada aralı arama ardıl arefe argın argon
  arıcı arıza arife arpçı arsız artık artım asabi aside asker asmak astar astım
  asude aşama aşina aşmak atağı atama ataşe atfen atıcı atılı atmak avane avans
  avare avdet avlak avrat avret ayırt aymaz ayraç ayrık ayrım azade azami azgın
  azlık azmak bağcı bağır bağıt bağlı bahis bakış bakla bakma balcı balya bando
  banko barit barok baron basın basış basma basur batak batık batıl batın batış
  batik baton bavul bayan bayat bayır bazal bazen bazik bedel beden bedii beher
  belek beliğ belli bemol bence benci bende benek beniz beşer beşik beşiz beyan
  beyaz beyin beyti bezek bezen biçem biçki biçme bidon bilir biliş bilme bindi
  biniş binme birer bitap bitik bitim bitli bitme bizce bizim bodur boğaz boğma
  boğuk boğum bohça bomba bordo borik borsa boyar boyca boylu boyoz bozma bozun
  bölen bölme bölük bölüm bölüş börek böyle branş bravo bronz buçuk budak buğur
  buhar buhur buket bulak bulgu bulma buluş bulut bunak bunca burcu burgu burma
  buruk butan butil buton buyur buzcu buzla buzlu büken bükme bükük bünye bürgü
  büstü büyük cacık cadde camız camlı canım canlı casus cazcı cazip cebir cebri
  celal celep celse cemre cenah cenin cepçi cephe cepli ceset cesur cetin cevaz
  cevri cezai cezbe cezve cılız cıvık cıvıl cicik cicim ciddi ciğer cihan cihat
  cihaz cilve cimci cimri cinai cinas cinci cinsi cisim cizye conta coşku coşma
  coşuş cumba cunta cücut cümle cüppe cüret cüruf cürüm cüsse çağır çağla çağrı
  çakal çakar çakım çakış çakma çakra çalan çalar çalgı çalık çalım çalma çamlı
  çancı çanlı çapar çaplı çapma çarık çarkı çarpı çaşıt çavuş çaycı çaylı çehre
  çeker çekik çekim çekiş çekme çekül çelen çello çelme çemen çenek çenet çengi
  çeper çerçi çerez çevik çevir çeyiz çığır çıkak çıkar çıkık çıkın çıkış çıkıt
  çıkma çınar çıngı çıpak çırak çıtak çıyan çilli çince çinko çinti çiriş çiroz
  çisli çitli çivit çizge çizik çizim çiziş çizme çoban çoğul çoğun çokça çolak
  çolpa çoluk çomak çomar çopur çorak çökek çökel çökme çöküm çöküş çömçe çömme
  çöpçü çöplü çörek çöven çözgü çözme çözük çözüm çözüş çukur çulcu çulha çupra
  çuval çürük çütük dağcı dahli daldı dalış damak damat damıt dargı darıl deist
  delgi delik delil delim demci demek demli denek deney dengi denli dense derin
  derme derse desti dışkı dışlı didik dikiş dikiz dikme dikse dikta dilli dilme
  dinen dinme dipli direk diren dirim diriş dişçi dişil dişli dizel dizge dizgi
  diziş dizme doğal doğan doğdu doğma doğru doğum doğuş dokuz dolan dolar doldu
  dolma dolum doluş donan donma donuk doyma döken dökme dölek dönek dönel döner
  dönme dönüm dönüş döşek döven dövme dövüş drene duble duman durdu durma duşlu
  duygu duyma duyum duyuş dübel düden düğme dünkü dürtü dürzü düşeş düşey düştü
  düşük düşüm düvel edalı edebi edici egale eğili eğimi eğmek ekili eklem ekmek
  eksik elbet elçek elgin eline elips elleç elvan emare emaye emici emmek emraz
  encam endam enine enlem ensiz entel enzim erbaş erdem ergen ergil erime erişi
  erkan erkek erken erkim erkin ermek esans esası esham esire eskiz eslaf eslek
  esmek esmer esnek eşarp eşhas eşkal eşkin eşlik eşmek eşraf eşref eşsiz etene
  etken etlik etmek etmen etnik etraf evcil evdeş evgin evham evlek evlik evren
  evrim evsaf evsiz evvel eylem eylül eyvah eyyam facia fahiş fahri fakir falan
  falcı fanus farzı fasıl fasit fauna fayda fazla fecir fehim fehva fekül felek
  fenci fener fenni ferah ferdi ferik ferli fesat fesih fetha fetih fetüs fetva
  fevri fırça fidye figan figür fiili fikri finiş firak firar fiske fitil fitne
  fitre fiyat flama flirt flora fokur fonda forma forum fosil frank frape frenk
  freze frigo fular fulya fuzul fücur fünun füsun gazel giriş gitar hazan içeri
  incir ithal jilet kakao katar kımız kırık kısık kıyım kıyma kiraz korna kuşak
  kuşçu küflü lahit leğen levha madam marka milli nadas namlu nişan oranı oraya
  öksüz ölçek ördek örnek örtük öteki özgün parça pelin pembe peşin pınar pilli
  pişik piyaz pruva rahat raspa resif resim revak revir saklı salsa sapan savaş
  seans serum sicil sifon sofra sökük söyle sunum sürat süsen süslü şahne şahsi
  şarap şayet şekva şubat şükür tatar tekil tekne temas temiz tepki tepsi terbi
  terek tesir testi titiz tohum tökez tüken tütün uçmak ummak uymaz uzlaş üzgün
  üzmek vagon vahim varak varan vasat vatan vazıh vedia vekil velur verev yakar
  yakın yanlı yarık yaslı yatsı yayım yıkık yitik yokla yollu yörük yüklü yüküm
  zarar zımba zikir zombi zurna
`)]);

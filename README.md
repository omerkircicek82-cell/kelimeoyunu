# Kelime Arenası

Arkadaşların davet koduyla aynı odaya katıldığı, gerçek zamanlı bir Türkçe kelime oyunu. Oda sahibi bireysel maçlarda 2–8 oyuncu sınırı, tüm maçlarda 3–10 tur ve süreli modda 30–300 saniyelik tur süresi seçebilir. Varsayılan maç beş tur ve tur başına 90 saniyedir. Her kelime için beş tahmin hakkı vardır.

Oda sahibi oyun başlamadan önce **Süreli** veya **Süresiz** modu seçebilir. Süresiz turda oyuncular ilk doğru tahmine kadar sayaçsız oynar. İki modda da ilk doğru tahmin, kalan oyuncular için bir defaya mahsus 30 saniyelik son şans başlatır. Süreli modun hız bonusu ayarlanan tur süresine göre hesaplanır. Süresiz modda çözüm ve tahmin bonusları uygulanır.

**2v2** ve **3v3** odalarında oyuncular iki takıma ayrılır. Maç için her iki takımda da seçilen sayıda oyuncu gerekir. Takım skoru, takım üyelerinin puanlarının toplamıdır. Oda koduyla izleyici olarak da katılabilirsiniz. Maç sırasında hem oyuncular hem izleyiciler her oyuncunun kaç tahmin yaptığını ve kelimeyi çözüp çözmediğini takip edebilir. Tahmin harflerini yalnızca yazan oyuncu görür. Tur ve maç sonuçlarında her kelime için süre, tahmin sayısı ve puan yer alır.

Bir turda kimse kelimeyi çözemezse her oyuncunun en yüksek puanlı tahmin satırı karşılaştırılır. Yeşil harf 50, sarı harf 25 puan değerindedir. Sıfırdan yüksek en iyi sonucu alan oyuncuların her biri bu puanın tamamını maç toplamına ekler. Kelime çözülürse çözüm puanları geçerlidir.

## Android

Mobil uygulama `apps/mobile` dizinindedir. Telefonda yerel ağ testi, Android APK önizlemesi ve Google Play için imzalı AAB oluşturma adımları [Android kılavuzunda](docs/android.md) yer alır.

Android ana ekranından Online, Çevrimdışı veya Lider Tablosu açılabilir. Çevrimdışı antrenman, cihazdaki Türkçe sözlükle süreli ve süresiz olarak çalışır. Misafirler genel puan kazanmadan oynar. Kayıtlı oyuncular 1.000 genel puanla başlar. Online tamamlanan her tur ve eşitlenen çevrimdışı tek kelimelik oyun, derece puanına işlenir.

Web’de üst menüdeki **Giriş / Kayıt** düğmesiyle hesap oluşturabilir veya mevcut Android hesabınıza girebilirsiniz. Web’de hesapla tamamladığınız online turlar aynı genel puana işlenir. **Lider tablosu** üst menüden açılır.

Web ana sayfasındaki **Çevrimdışı oyna** düğmesi, süreli veya süresiz tek kişilik oyunu açar. Önceden bağlantı kurup hesapla bilet aldıysanız tarayıcı sonuçları yerelde bekletir ve bağlantı geri gelince aynı genel puana işler. Yerel ağın HTTP adresinde oyun açık sekmede çalışır. HTTPS veya `localhost` üzerinden ilk yükleme tamamlandıktan sonra tarayıcı oyunu bağlantısız olarak yeniden açabilir.

Kelime çözülürse 24 puan eklenir, çözülmezse 24 puan düşer. En iyi tahmin satırındaki her yeşil harf 3, sarı harf 1 puan ekler. Genel puan sıfırın altına inmez. Kayıtlı Android cihazları oyun sunucusundan en fazla sekiz açık çevrimdışı bilet alır. Tamamlanan biletli oyunlar bağlantı geri gelince bir kez eşitlenir. Biletler yedi gün boyunca geçerlidir. Çevrimdışı istemci cevabı yerel olarak tuttuğu için bu sonuçlar, online maçlarla aynı düzeyde hileye dayanıklı değildir.

Genel puan **Bronz**, **Gümüş**, **Altın** ve **Elmas** liglerini belirler. Gümüş 1.100, Altın 1.300, Elmas 1.600 puanda başlar. Hesap ekranında kazanılan rozetler, oyuncu unvanı ve art arda kelime çözülen dereceli tur sayısı gösterilir.

**Günlük mücadele** İstanbul tarihi değiştiğinde yenilenir. Hesabınıza girip günün sırasıyla gelen beş ortak kelimesini, kelime başına beş tahmin hakkıyla çözebilirsiniz. Oyun ilerlemeyi kaydeder ve kaldığınız yerden devam edebilirsiniz. Beş turu bitirince günlük sıralamaya girersiniz. Sıralama önce çözülen kelime sayısına, ardından tahmin sayısından kazanılan günlük puana bakar.

## Gereksinimler

- Yerel geliştirme için Node.js 22.12+ (22.x) veya 24.x ve npm
- PostgreSQL 16 veya PostgreSQL'i başlatmak için Docker ve Docker Compose v2
- Tam Compose kurulumu için Docker ve Docker Compose v2 yeterlidir.

## Yerel geliştirme

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d --wait
npm ci
npm run migrate
npm run dev
```

Vite varsayılan olarak 5173, NestJS 3000 numaralı portta çalışır. Vite, `/api/` ve `/socket.io/` isteklerini API'ye iletir. İki tarayıcı profili açın, ilkinde oda oluşturun, ikincisinde davet bağlantısıyla katılın. Oda sahibi dışındaki oyuncular hazır olduğunda oda sahibi maçı başlatabilir.

Yerel PostgreSQL kurulumunuz varsa Compose komutu yerine `.env` içindeki `DATABASE_URL` değerini o veritabanına göre ayarlayın. API, kelime sözlüğünü açılışta PostgreSQL'den yüklediği için `DATABASE_URL` gerekir.

```bash
npm run check
npm test
npm run build
```

`npm run build` web ve API üretim çıktılarını oluşturur. Derleme sonrasında API'yi ayrıca `npm run start -w @arena/api` ile çalıştırabilirsiniz.

## Ortam değişkenleri

| Değişken | Kullanım |
| --- | --- |
| `DATABASE_URL` | Yerel geliştirmede PostgreSQL bağlantı adresi. Tam Compose kurulumu servis adresini kendi oluşturur. URL'deki özel karakterleri kodlayın. |
| `POSTGRES_PASSWORD` | Compose veritabanı parolası. Tam Compose kurulumu için `openssl rand -hex 32` ile yeni bir değer üretin. |
| `POSTGRES_PORT` | Yalnızca geliştirme Compose'unda PostgreSQL'in yerel portu. Varsayılan 5432. `DATABASE_URL` ile aynı portu kullanın. |
| `PORT` | Yerel API portu. Varsayılan 3000. Değiştirirseniz Vite proxy hedefini de eşleştirin. |
| `ARENA_VITE_API` | Geliştirmede Vite proxy hedefi. Örneğin `ARENA_VITE_API=http://localhost:3010 npm run dev`. |
| `CORS_ORIGIN` | İzin verilen tarayıcı origin'leri, virgülle ayrılır. Üretimde örnek değerleri gerçek HTTPS adresiyle değiştirin. Şema ve gerektiğinde portu ekleyin. |
| `TRUST_PROXY` | Tam Compose kurulumunda API, Nginx tarafından eklenen istemci adresine güvenir. API doğrudan erişilebiliyorsa bu ayarı etkinleştirmeyin. |
| `BIND_ADDRESS`, `PUBLIC_PORT` | Tam Compose kurulumunda Nginx'in makine üzerindeki dinleme adresi ve portu. Varsayılan `127.0.0.1:8080`. |

## Docker Compose ile çalıştırma

`.env.example` dosyasından `.env` oluşturun ve PostgreSQL parolasını değiştirin. Ardından proje kökünde çalıştırın.

```bash
docker compose up -d --build --wait
docker compose ps -a
curl -fsS http://127.0.0.1:8080/api/health
```

Nginx web uygulamasını, REST API'yi ve Socket.IO bağlantısını aynı origin üzerinden sunar. `GET /api/health` API ve depolama durumunu, `GET /api/rules` tur, tahmin ve oyuncu kurallarını döndürür. PostgreSQL hazır olduğunda `migrate` servisi migration'ları uygular ve başarıyla çıkar. Daha sonra API başlar. PostgreSQL verileri `arena-db` adlı kalıcı Docker volume'ünde tutulur.

Prisma 7 istemcisi `npm ci` sırasında üretilir. `npm run migrate`, npm kilit dosyasında sabitlenen Prisma şema motorunun WebAssembly sürümünü kullanır. Mevcut sürümün migration'larını tekrar uygulamak için `docker compose run --rm migrate` kullanın. Yeni migration'ları geliştirme veritabanında oluşturun ve SQL dosyalarını sürüm kontrolüne ekleyin. Üretim veritabanında yalnızca dağıtım migration'larını uygulayın.

## Kelime sözlüğü

Migration’lar PostgreSQL'deki `DictionaryWord` tablosunu 5.805 farklı beş harfli kelimeyle doldurur. `Â`, `Î` ve `Û` ekran klavyesinde kullanılabilir. `isAnswer` alanı açık olan 502 kelime maç cevabı olarak seçilebilir. Tablodaki tüm kelimeler tahmin olarak kabul edilir. API, listeyi açılışta belleğe alır. Veritabanında sözlüğü güncelledikten sonra API'yi yeniden başlatın.

Daha önce kurduysanız güncel kodla `docker compose up -d --build --wait` çalıştırarak migration'ı uygulayabilirsiniz. Yerel geliştirmede `npm run migrate` çalıştırın ve API'yi yeniden başlatın. Sözlüğün kaynak ve lisans bilgileri `apps/api/licenses/zemberek` dizinindedir.

## Üretime dağıtım

Nginx'i loopback üzerinde tutup gerçek alan adı için TLS sonlandıran bir reverse proxy arkasında çalıştırın. TLS proxy'sinde WebSocket upgrade başlıklarını ve uzun ömürlü bağlantıları destekleyin. `CORS_ORIGIN` değerine dışarıdan erişilen HTTPS origin'ini yazın. Aynı ağdaki cihazlarla kontrollü bir deneme için `BIND_ADDRESS=0.0.0.0` kullanabilir ve açacağınız origin'i listeye ekleyebilirsiniz.

Veritabanı volume'ünü yedekleyin. API'nin aktif oda ve maç durumu bellekte tutulduğu için tek API instance çalıştırın. API yeniden başlatıldığında devam eden maçlar sıfırlanır. Kalıcı maç kayıtları PostgreSQL'de saklanır.

## Sorun giderme

- **API başlamıyor.** `docker compose logs postgres migrate api` ile migration ve veritabanı bağlantısını kontrol edin. Var olan bir PostgreSQL volume'ünde `POSTGRES_PASSWORD` ayarını değiştirmek veritabanı parolasını kendiliğinden değiştirmez.
- **Odaya bağlanılamıyor.** Tarayıcı adresinin origin'ini `CORS_ORIGIN` ile karşılaştırın. HTTPS proxy kullanıyorsanız `/socket.io/` yolunun WebSocket upgrade isteklerini ilettiğini kontrol edin.
- **Sayfa yenilenince oturum açılmıyor.** Aynı tarayıcı sekmesini ve origin'i kullanın. Tarayıcının site verileri temizlenmişse önceki misafir oturumu kullanılamaz.
- **Port kullanımda.** Tam Compose ortamı için `PUBLIC_PORT` değerini değiştirin. Yerel PostgreSQL portu için `POSTGRES_PORT` ve `DATABASE_URL` değerlerini birlikte güncelleyin.

## Mimari

`apps/web` React ve Vite istemcisidir. `apps/api` NestJS REST ve Socket.IO katmanlarını, oda yönetimini ve Prisma veri erişimini içerir. Platformdan bağımsız protokol tipleri ve oyun kuralları sırasıyla `packages/shared` ve `packages/game-engine` içinde yer alır.

Sunucu tur saatini, kelime doğrulamayı ve puan hesaplamayı yönetir. Oyuncular kendi tahmin geçmişini ve diğer oyuncuların skor ve tur durumunu alır. Doğru kelime tur bitince açıklanır. Özel davet odalarında hesapla veya misafir olarak oynanabilir.

### API ve Socket.IO

[Ortak protokol tipleri](packages/shared/src/index.ts) komutları, yanıtları ve sunucu olaylarını tanımlar. İstemci `room:create`, `room:join` veya `room:spectate` ile bir oturum anahtarı alır. Yeniden bağlanırken `room:resume` kullanır ve `room:update` olayından güncel durumunu geri yükler.

`game:submit-guess` komutu maç, tur ve benzersiz istek kimliğini taşır. Yanıt yalnızca gönderen oyuncuya iletilir. Ağ zaman aşımından sonra aynı tahmin yeniden gönderilecekse aynı istek kimliği kullanılmalıdır.

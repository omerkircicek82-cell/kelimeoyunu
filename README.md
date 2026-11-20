# Kelime Arenası

Arkadaşların davet koduyla aynı odaya katıldığı, gerçek zamanlı bir Türkçe kelime oyunu. Özel odalar 2–8 oyuncuyu destekler. Bir maçta oyuncular beş farklı kelimeyi, her turda 90 saniye ve beş tahmin hakkıyla çözmeye çalışır.

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

Sunucu tur saatini, kelime doğrulamayı ve puan hesaplamayı yönetir. Oyuncular kendi tahmin geçmişini ve diğer oyuncuların halka açık skor ve tur durumunu alır. Doğru kelime tur bitince açıklanır. Şu an misafir oturumları ve özel davet odaları çalışır. Hesap sistemi, herkese açık oda keşfi ve Redis ile çoklu API instance desteği sonraki sürümlere bırakılmıştır.

### API ve Socket.IO

[Ortak protokol tipleri](packages/shared/src/index.ts) komutları, yanıtları ve sunucu olaylarını tanımlar. İstemci `room:create` veya `room:join` ile bir oturum anahtarı alır. Yeniden bağlanırken `room:resume` kullanır ve `room:update` olayından güncel durumunu geri yükler.

`game:submit-guess` komutu maç, tur ve benzersiz istek kimliğini taşır. Yanıt yalnızca gönderen oyuncuya iletilir. Ağ zaman aşımından sonra aynı tahmin yeniden gönderilecekse aynı istek kimliği kullanılmalıdır.

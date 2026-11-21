# Kelime Arenası Android

Android uygulaması, oyunun mevcut NestJS ve PostgreSQL sunucusuna Socket.IO üzerinden bağlanır. Web ve Android oyuncuları aynı oda koduyla birlikte oynayabilir.

## Windows'ta telefonda deneme

1. Docker Desktop’ı açın. Proje kökündeki `.env` dosyasında `BIND_ADDRESS=0.0.0.0` ve `PUBLIC_PORT=8080` ayarlarını kullanın.
2. PowerShell’de `docker compose up -d --build --wait` çalıştırın. Telefon ve bilgisayar aynı Wi-Fi ağına bağlı olmalı. `ipconfig` ile Wi-Fi veya Ethernet IPv4 adresini bulun.
3. Telefon tarayıcısından `http://192.168.1.42:8080/api/health` adresini deneyin. Örnekteki IP yerine bilgisayarınızın IP adresini kullanın. Yanıtta `"status":"ok"` ve `"storage":"postgresql"` görünmeli.
4. Bilgisayarda Node.js 24 LTS, telefonda Expo Go kurulu olmalı. Proje kökünden şu komutları çalıştırın.

```powershell
cd apps/mobile
$env:EXPO_PUBLIC_ARENA_URL = "http://192.168.1.42:8080"
npm.cmd ci
npm.cmd start
```

Expo Go ile terminaldeki QR kodu okutun. Başka bir LAN adresine geçerseniz hem Expo başlangıç ayarı hem uygulamadaki sunucu adresi güncellenebilir. QR kodu açılmıyorsa telefonun bilgisayardaki Expo portuna, oyun bağlantısı için de Docker’ın 8080 portuna erişebildiğinden emin olun.

### Android Studio emülatörü

Android Studio emülatörü Windows'taki oyun sunucusuna `http://10.0.2.2:8080` üzerinden erişir. Emülatörün Chrome tarayıcısında `http://10.0.2.2:8080/api/health` yanıtını kontrol edin. Expo Go yüklü emülatör açıkken `apps/mobile` dizininde çalıştırın.

```powershell
$env:EXPO_PUBLIC_ARENA_URL = "http://10.0.2.2:8080"
npm.cmd start -- --android --localhost --clear --port 8082
```

Sağlık adresi cevap veriyor ve uygulamada bağlantı kurulamadı mesajı görünüyorsa, emülatör Chrome'da `http://10.0.2.2:8080/socket.io/?EIO=4&transport=polling` adresini açın. Başarılı yanıt `0{"sid":...` ile başlar. Expo terminalindeki `[Kelime Arenası] Socket.IO bağlantısı` satırı mobil bağlantı hatasının ayrıntısını gösterir.

## Android paketleri

| Profil | Dosya | Kullanım |
| --- | --- | --- |
| `preview` | APK | Test telefonuna doğrudan kurulur. Yerel ağdaki HTTP sunucusuna bağlanabilir. |
| `production` | AAB | Google Play’e yüklenir. Genel erişime açık HTTPS sunucusu gerekir. |

Android paket adı `com.kelimearenasi.oyun`. İlk Google Play yüklemesinden önce kalıcı paket adınızı `apps/mobile/app.json` içinde belirleyin. Önizleme paketi ayrı kurulur. Expo SDK 58, Android API 36’yı hedefler ve API 24 veya üzerindeki cihazları destekler. Yükleme sırasında Play Console’un güncel hedef API şartını kontrol edin. [Google Play hedef API şartları](https://support.google.com/googleplay/android-developer/answer/11926878?hl=tr)

### EAS Build ile imzalı AAB oluşturma

1. Oyun sunucusunu HTTPS ile internetten erişilebilir bir alan adında çalıştırın. Nginx WebSocket yönlendirmesi etkin olmalı. Telefon Wi-Fi kapalıyken de `https://alan-adiniz/api/health` yanıtını kontrol edin. Yerel ağ IP’siyle yapılan deneme yalnızca yerel ağda çalışır.
2. Bilgisayarda Node.js 24 LTS ve Git, ayrıca bir Expo hesabı kullanın. Expo’nun çalışma alanı arşivi, uygulamayla birlikte `packages/shared` klasörünü de içerir.
3. PowerShell’de proje kökünden çalıştırın.

```powershell
cd apps/mobile
npm.cmd ci
npx.cmd eas-cli@latest login
npx.cmd eas-cli@latest init
npx.cmd eas-cli@latest env:create --environment production --name EXPO_PUBLIC_ARENA_URL --value https://alan-adiniz --visibility plaintext
npx.cmd eas-cli@latest build --platform android --profile production
```

`init` dinamik Expo yapılandırması nedeniyle proje kimliğini eklemenizi isterse, CLI’nın gösterdiği kimliği `apps/mobile/app.json` dosyasında `expo.extra.eas.projectId` alanına yazın. EAS imzalama adımında ilk yükleme için kendi yükleme anahtarınızı seçin veya EAS ile oluşturun. Mevcut bir Play uygulamasının sürümünü güncelliyorsanız o uygulamanın kayıtlı yükleme anahtarını kullanın.

Doğrudan telefona kurulacak test APK’sı için `npx.cmd eas-cli@latest build --platform android --profile preview` çalıştırın. Profil LAN bağlantısına izin verir. Sunucu adresini uygulama içinde girebilir veya EAS’in `preview` ortamında `EXPO_PUBLIC_ARENA_URL` ile verebilirsiniz.

### Git olmadan yerelde AAB oluşturma

Node.js 24 LTS, Android Studio ve JDK 17 kurun. Android Studio’nun **SDK Manager** ekranından Android SDK Platform 37, Build Tools 37.0.0, NDK (Side by side) 27.1.12297006 ve CMake 3.22.1 bileşenlerini yükleyin. SDK Tools sekmesinde sürümleri seçmek için **Show Package Details** seçeneğini açabilirsiniz. Android Studio’da **Settings → Build, Execution, Deployment → Build Tools → Gradle** altında JDK 17’yi seçin. Proje kökünde PowerShell açıp çalıştırın.

```powershell
cd apps/mobile
npm.cmd ci
$env:EXPO_PUBLIC_ARENA_URL = "https://alan-adiniz"
$env:ARENA_RELEASE = "1"
npx.cmd expo prebuild --platform android --no-install
```

Aynı `EXPO_PUBLIC_ARENA_URL` değerinin Android Studio’nun çalıştığı oturumda da tanımlı olması gerekir. PowerShell’deki değişken yalnızca o oturum ve oradan açılan uygulamalar için geçerlidir. Gradle’ın JavaScript paketlemesi için bunu kullanıcı ortam değişkeni olarak ayarlayıp Android Studio’yu yeniden açabilir veya `apps/mobile/.env.local` dosyasına yazabilirsiniz. Android Studio’da `apps/mobile/android` klasörünü açın. **Build → Generate Signed App Bundle / APK → Android App Bundle** üzerinden `release` için kendi yükleme anahtarınızı seçip AAB oluşturun. Sonraki yerel Play derlemelerinden önce `app.json` içindeki `expo.android.versionCode` değerini artırıp `expo prebuild` komutunu yeniden çalıştırın.

### Git olmadan yerelde test APK’sı oluşturma

JDK 17 ve Android SDK’yı yukarıdaki gibi kurun. PowerShell’de `JAVA_HOME` JDK 17 klasörünü, `ANDROID_HOME` Android SDK klasörünü göstermeli. Varsayılan Android Studio kurulumunda SDK yolu genellikle `$env:LOCALAPPDATA\Android\Sdk` olur. Proje kökünden çalıştırın. IP adresini kendi bilgisayarınızın adresiyle değiştirin.

```powershell
cd apps/mobile
npm.cmd ci
$env:ARENA_RELEASE = "0"
$env:ARENA_LAN_PREVIEW = "1"
$env:EXPO_PUBLIC_ARENA_URL = "http://192.168.1.42:8080"
npx.cmd expo prebuild --platform android --no-install
cd android
.\gradlew.bat :app:assembleRelease
```

Test APK’sı `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` yoluna yazılır. Expo’nun test imzasını ve ayrı önizleme paket adını kullanır. Google Play için üretim AAB’si oluşturma adımlarını uygulayın.

## Play Console kontrolü

- AAB’yi önce **Internal testing** kanalına yükleyip Play’den kurulan sürümde iki cihazla oda daveti, tam maç, yeniden bağlanma ve rövanşı deneyin. Hesabınıza uygulanan üretim erişimi ve test gereksinimlerini Play Console’da kontrol edin.
- Mağaza simgesi `apps/mobile/assets/play-icon.png` (512 × 512). Özellik görseli `apps/mobile/assets/play-feature.png` (1024 × 500). Telefon ekran görüntülerini çalıştırdığınız uygulamadan ekleyin.
- Kısa açıklama olarak “Arkadaşlarınla beş harfli Türkçe kelimeleri gerçek zamanlı tahmin et.” kullanabilirsiniz.
- Oyuncunun paylaştığı takma ad ve oda adı ile tahmin, puan ve maç kayıtları sunucuda tutulur. Gizlilik politikasını ve **Data safety** yanıtlarını kendi sunucu sağlayıcınız, erişim kayıtlarınız, saklama süreniz ve iletişim bilgilerinizle uyumlu hazırlayın. Google Play’e girilecek gizlilik politikası URL’si internetten açılabilmeli.
- İlk yüklemeye geçmeden önce paketin yayın imzasını, hedef SDK bilgilerini ve Play Console’un 16 KB sayfa boyutu denetimini kontrol edin.

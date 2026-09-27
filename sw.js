// Цей service worker навмисно НІЧОГО не кешує.
// Його єдина задача — прибрати за старою версією (яка кешувала файли
// й через це показувала застарілу сторінку), якщо вона вже встановлена
// в браузері користувача.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // видаляємо всі кеші, які могла лишити стара версія
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      // знімаємо сам service worker з контролю сторінки
      await self.registration.unregister();
      // і перезавантажуємо всі відкриті вкладки, щоб вони почали
      // працювати напряму з мережею, без жодного посередника
      const clientsList = await self.clients.matchAll({ type: 'window' });
      clientsList.forEach((client) => client.navigate(client.url));
    })()
  );
});

import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-privacy',
  imports: [RouterLink],
  template: `
    <div class="mx-auto w-full max-w-2xl px-6 py-10">
      <h1 class="font-display text-3xl text-paper">Privacidad</h1>
      <p class="text-muted mt-2 text-sm">Última actualización: agosto de 2026.</p>

      <div class="mt-8 space-y-6 text-paper">
        <section>
          <h2 class="font-display text-xl">Qué guardamos</h2>
          <ul class="text-muted mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>Tu email y tu nombre, para identificar tu cuenta.</li>
            <li>Tu contraseña cifrada. Nadie puede leerla.</li>
            <li>Los items de tu biblioteca: lo que añades, puntúas y anotas.</li>
          </ul>
        </section>

        <section>
          <h2 class="font-display text-xl">Qué no hacemos</h2>
          <ul class="text-muted mt-2 list-disc space-y-1 pl-5 text-sm">
            <li>No hay analítica, ni rastreadores, ni cookies de terceros.</li>
            <li>La única cookie es la de tu sesión, y se borra al cerrarla.</li>
            <li>No vendemos ni compartimos tus datos con nadie.</li>
            <li>No hay registro abierto: las cuentas se crean una a una.</li>
          </ul>
        </section>

        <section>
          <h2 class="font-display text-xl">De dónde salen las carátulas</h2>
          <p class="text-muted mt-2 text-sm">
            Las fichas de películas vienen de TMDB y las portadas de libros de Open Library. Tu navegador carga esas
            imágenes directamente de sus servidores, así que esos servicios ven tu petición como cualquier otra visita
            web. No les enviamos quién eres ni qué tienes en tu biblioteca.
          </p>
        </section>

      </div>

      <a routerLink="/" class="text-amber mt-10 inline-block text-sm hover:underline">← Volver a la biblioteca</a>
    </div>
  `,
})
export class Privacy {}

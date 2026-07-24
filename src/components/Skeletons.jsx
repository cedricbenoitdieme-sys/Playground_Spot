import React from 'react';

// Carte individuelle de terrain skeleton
export const TerrainCardSkeleton = () => (
  <div className="bg-white rounded-card overflow-hidden border border-black/5 shadow-subtle flex flex-col h-full">
    {/* Image container skeleton */}
    <div className="aspect-[16/9] w-full animate-shimmer" />
    
    {/* Content skeleton */}
    <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200 animate-shimmer" />
        <div className="h-3 w-1/2 rounded bg-gray-200 animate-shimmer" />
      </div>
      
      <div className="flex items-center justify-between pt-3 border-t border-gray-50">
        <div className="space-y-1">
          <div className="h-2 w-12 rounded bg-gray-200 animate-shimmer" />
          <div className="h-4 w-24 rounded bg-gray-200 animate-shimmer" />
        </div>
        <div className="h-8 w-20 rounded-lg bg-gray-200 animate-shimmer" />
      </div>
    </div>
  </div>
);

// Squelette pour la page d'accueil joueur
export const JoueurHomeSkeleton = () => (
  <div className="flex-1 space-y-6 pb-28 px-6 lg:px-8 py-6">
    {/* Banner Skeleton */}
    <div className="h-48 rounded-[2.5rem] bg-[#0F2318]/40 border border-white/5 p-6 md:p-8 flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="h-5 w-24 rounded-full bg-white/10 animate-shimmer" />
        <div className="h-8 w-1/2 rounded-lg bg-white/10 animate-shimmer" />
        <div className="h-4 w-1/3 rounded bg-white/5 animate-shimmer" />
      </div>
      <div className="h-14 w-full max-w-md rounded-2xl bg-white/10 animate-shimmer" />
    </div>

    {/* Promo Banner Skeleton */}
    <div className="h-16 rounded-[2rem] bg-gray-100 animate-shimmer" />

    {/* Recommended Terrains Skeleton Grid */}
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-4 w-40 rounded bg-gray-200 animate-shimmer" />
        <div className="h-3 w-16 rounded bg-gray-200 animate-shimmer" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TerrainCardSkeleton />
        <TerrainCardSkeleton />
        <TerrainCardSkeleton />
      </div>
    </div>

    {/* Match Card Skeleton */}
    <div className="h-28 rounded-card bg-gray-100 border border-black/5 animate-shimmer" />
  </div>
);

// Squelette pour la page de découverte/recherche
export const DiscoverySkeleton = () => (
  <div className="flex-1 space-y-6 pb-12 px-6 lg:px-8 py-6">
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="h-8 w-56 rounded bg-gray-200 animate-shimmer" />
        <div className="h-4 w-96 rounded bg-gray-200 animate-shimmer" />
      </div>
    </div>

    {/* Filter items skeleton */}
    <div className="flex gap-2 overflow-x-auto pb-2">
      <div className="h-10 w-24 rounded-xl bg-gray-200 animate-shimmer shrink-0" />
      <div className="h-10 w-32 rounded-xl bg-gray-200 animate-shimmer shrink-0" />
      <div className="h-10 w-28 rounded-xl bg-gray-200 animate-shimmer shrink-0" />
      <div className="h-10 w-36 rounded-xl bg-gray-200 animate-shimmer shrink-0" />
    </div>

    {/* Grid cards skeleton */}
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
      <TerrainCardSkeleton />
      <TerrainCardSkeleton />
      <TerrainCardSkeleton />
      <TerrainCardSkeleton />
    </div>
  </div>
);

// Squelette pour la page de détail terrain
export const TerrainDetailSkeleton = () => (
  <div className="flex-1 bg-background overflow-y-auto pb-32 lg:pb-12 px-4 lg:px-8 py-6">
    <div className="max-w-6xl mx-auto flex items-center justify-between mb-6">
      <div className="h-6 w-36 rounded bg-gray-200 animate-shimmer" />
      <div className="h-10 w-10 rounded-full bg-gray-200 animate-shimmer" />
    </div>

    <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-8">
        {/* Main image banner */}
        <div className="aspect-[16/9] w-full rounded-3xl bg-gray-200 animate-shimmer" />
        
        {/* Detail content card */}
        <div className="bg-white p-8 rounded-card border border-black/5 space-y-6">
          <div className="flex justify-between items-start gap-4">
            <div className="space-y-2 flex-1">
              <div className="h-8 w-2/3 rounded bg-gray-200 animate-shimmer" />
              <div className="h-4 w-1/3 rounded bg-gray-200 animate-shimmer" />
            </div>
            <div className="h-12 w-24 rounded-2xl bg-gray-200 animate-shimmer" />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y border-gray-50">
            {[1, 2, 3, 4].map(n => (
              <div key={n} className="h-10 rounded bg-gray-100 animate-shimmer" />
            ))}
          </div>

          <div className="space-y-2">
            <div className="h-4 w-20 rounded bg-gray-200 animate-shimmer" />
            <div className="h-3 w-full rounded bg-gray-200 animate-shimmer" />
            <div className="h-3 w-full rounded bg-gray-200 animate-shimmer" />
            <div className="h-3 w-4/5 rounded bg-gray-200 animate-shimmer" />
          </div>
        </div>
      </div>

      {/* Right Column Reservation box */}
      <div>
        <div className="bg-white p-8 rounded-card border border-black/5 space-y-6">
          <div className="space-y-2">
            <div className="h-3 w-16 rounded bg-gray-200 animate-shimmer" />
            <div className="h-8 w-40 rounded bg-gray-200 animate-shimmer" />
          </div>
          <div className="h-14 w-full rounded-2xl bg-gray-200 animate-shimmer" />
          <div className="h-14 w-full rounded-2xl bg-gray-200 animate-shimmer" />
        </div>
      </div>
    </div>
  </div>
);

// Squelette pour la page de liste des réservations / tables
export const ReservationsSkeleton = () => (
  <div className="flex-1 space-y-6 pb-12 px-6 lg:px-8 py-6">
    <div className="space-y-2">
      <div className="h-8 w-48 rounded bg-gray-200 animate-shimmer" />
      <div className="h-4 w-80 rounded bg-gray-200 animate-shimmer" />
    </div>

    {/* Tab filter loaders */}
    <div className="flex gap-2 w-fit bg-white p-1 rounded-xl border border-gray-100">
      <div className="h-9 w-24 rounded-lg bg-gray-100 animate-shimmer" />
      <div className="h-9 w-24 rounded-lg bg-gray-100 animate-shimmer" />
      <div className="h-9 w-24 rounded-lg bg-gray-100 animate-shimmer" />
    </div>

    {/* Cards grid loading list */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {[1, 2, 3].map((n) => (
        <div key={n} className="bg-white rounded-[2rem] border border-black/5 p-5 space-y-4">
          <div className="flex gap-4">
            <div className="w-24 h-24 rounded-2xl bg-gray-200 animate-shimmer shrink-0" />
            <div className="flex-1 space-y-3">
              <div className="h-4 w-1/3 rounded bg-gray-200 animate-shimmer" />
              <div className="h-6 w-3/4 rounded bg-gray-200 animate-shimmer" />
              <div className="h-3.5 w-1/2 rounded bg-gray-200 animate-shimmer" />
            </div>
          </div>
          <div className="h-10 w-full rounded-xl bg-gray-100 animate-shimmer" />
        </div>
      ))}
    </div>
  </div>
);

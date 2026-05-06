/**
 * Утилиты для импорта/экспорта исследованных территорий (CoveredTiles)
 */

const API_BASE = "http://127.0.0.1:10001/api";

export async function exportTiles(userId, token) {
  const url = `${API_BASE}/data/export/tiles?userId=${userId}`;

  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      console.error(`Ошибка экспорта тайлов: ${response.status}`);
      return false;
    }

    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'tiles.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  } catch (error) {
    console.error('Ошибка при скачивании tiles.csv:', error);
    return false;
  }
}

export async function importTiles(userId, tilesFile, token) {
  if (!tilesFile) {
    return { success: false, message: 'Необходимо выбрать файл tiles.csv' };
  }

  const formData = new FormData();
  formData.append('tiles_file', tilesFile);

  try {
    const response = await fetch(`${API_BASE}/data/import/tiles?userId=${userId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, message: `Ошибка ${response.status}: ${errorText}` };
    }

    const data = await response.json();
    return {
      success: true,
      message: `Импорт завершён: добавлено ${data.imported}, пропущено ${data.skipped}`,
      imported: data.imported,
      skipped: data.skipped
    };
  } catch (error) {
    console.error('Ошибка импорта тайлов:', error);
    return { success: false, message: `Ошибка сети: ${error.message}` };
  }
}
const API_BASE = "http://127.0.0.1:10001/api";

async function downloadFile(url, filename, token) {
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!response.ok) {
      console.error(`Ошибка загрузки ${filename}: ${response.status}`);
      return false;
    }
    
    const blob = await response.blob();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    URL.revokeObjectURL(link.href);
    return true;
  } catch (error) {
    console.error(`Ошибка при скачивании ${filename}:`, error);
    return false;
  }
}

export async function exportSelectedWalks(userId, walkIds, token) {
  if (!walkIds || walkIds.length === 0) {
    alert('Не выбрано ни одной прогулки');
    return;
  }

  const walkIdsParam = walkIds.join(',');
  
  // Экспорт walks.csv
  const walksUrl = `${API_BASE}/data/export/walks?userId=${userId}&walkIds=${walkIdsParam}`;
  await downloadFile(walksUrl, 'walks.csv', token);
  
  // Экспорт walkpoints.csv
  const walkpointsUrl = `${API_BASE}/data/export/walkpoints?userId=${userId}&walkIds=${walkIdsParam}`;
  await downloadFile(walkpointsUrl, 'walkpoints.csv', token);
}

export async function importWalks(userId, walksFile, walkpointsFile, token) {
  if (!walksFile || !walkpointsFile) {
    return { success: false, message: 'Необходимо выбрать оба файла: walks.csv и walkpoints.csv' };
  }

  const formData = new FormData();
  formData.append('walks_file', walksFile);
  formData.append('walkpoints_file', walkpointsFile);

  try {
    const response = await fetch(`${API_BASE}/data/import/walks?userId=${userId}`, {
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
      message: `Импорт завершён: добавлено ${data.imported}, пропущено ${data.skipped}, новых тайлов: ${data.newTiles}`,
      imported: data.imported,
      skipped: data.skipped,
      newTiles: data.newTiles
    };
  } catch (error) {
    console.error('Ошибка импорта:', error);
    return { success: false, message: `Ошибка сети: ${error.message}` };
  }
}
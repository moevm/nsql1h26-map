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
import ExcelJS from 'exceljs';
import type { Run, RunnerStats } from '../types';
import { durationToSeconds, secondsToPace } from './ocrParser';

/**
 * Formats a German date from YYYY-MM-DD to DD.MM.YYYY
 */
function formatDateGerman(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  }
  return dateStr;
}

/**
 * Helper to compute average pace across a list of runs
 */
function calculateAveragePaceOfRuns(runs: Run[]): string {
  if (runs.length === 0) return '0:00';
  
  let totalDistance = 0;
  let totalSeconds = 0;
  
  runs.forEach(run => {
    totalDistance += run.distance;
    totalSeconds += durationToSeconds(run.duration);
  });
  
  if (totalDistance === 0) return '0:00';
  
  const averagePaceSecs = totalSeconds / totalDistance;
  return secondsToPace(averagePaceSecs);
}

/**
 * Generates and downloads a beautifully styled Excel file using ExcelJS
 */
export async function exportToExcel(runs: Run[], stats: RunnerStats[]) {
  const workbook = new ExcelJS.Workbook();
  const dateToday = new Date().toISOString().split('T')[0];

  // Font family config
  const fontName = 'Segoe UI';

  // --- SHEET 1: AKTIVITÄTEN ---
  const ws1 = workbook.addWorksheet('Aktivitäten', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 3 }]
  });

  // 1. Title Banner
  ws1.mergeCells('A1:F1');
  const titleCell = ws1.getCell('A1');
  titleCell.value = 'Laufgruppe - Aktivitätsprotokoll';
  titleCell.font = { name: fontName, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate-800
  };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws1.getRow(1).height = 45;

  // Row 2 is blank for spacing
  ws1.getRow(2).height = 15;

  // 2. Table Headers
  const headers1 = ['Datum', 'Läufer', 'Distanz', 'Dauer', 'Durchschnitts-Pace', 'Quelle / App'];
  ws1.getRow(3).values = headers1;
  ws1.getRow(3).height = 28;

  // Style Header Row
  ws1.getRow(3).eachCell((cell) => {
    cell.font = { name: fontName, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF334155' } // Slate-700
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF1E293B' } }
    };
  });

  // Sort runs: newest first
  const sortedRuns = [...runs].sort((a, b) => b.timestamp - a.timestamp);

  // 3. Add Data Rows
  sortedRuns.forEach((run, idx) => {
    const rowNum = idx + 4; // Data starts at row 4
    const row = ws1.getRow(rowNum);
    
    row.values = [
      formatDateGerman(run.date),
      run.runnerName,
      run.distance,
      run.duration,
      run.pace + ' min/km',
      run.sourceApp
    ];
    row.height = 22;

    // Apply alignments & formats
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }; // Date
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };   // Runner
    row.getCell(2).font = { name: fontName, bold: true };
    row.getCell(3).alignment = { horizontal: 'right', vertical: 'middle' };  // Distance
    row.getCell(3).numFmt = '0.00" km"';
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }; // Duration
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };  // Pace
    row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' }; // Source

    // Zebra striping
    const isEven = idx % 2 === 0;
    const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC'; // White vs light Slate-50
    row.eachCell((cell, colNumber) => {
      cell.font = { name: fontName, size: 10, bold: colNumber === 2 };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: rowBg }
      };
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });

  // 4. Summary Row (accounting format)
  if (sortedRuns.length > 0) {
    const sumRowNum = sortedRuns.length + 4;
    const sumRow = ws1.getRow(sumRowNum);
    sumRow.height = 25;

    sumRow.values = [
      'Gesamt / Schnitt',
      '',
      // Excel formula for Sum
      { formula: `SUM(C4:C${sumRowNum - 1})` },
      'Schnitt-Pace:',
      calculateAveragePaceOfRuns(sortedRuns) + ' min/km',
      ''
    ];

    // Style summary row
    sumRow.eachCell((cell, colIdx) => {
      cell.font = { name: fontName, size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' } // Slate-100
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF475569' } },
        bottom: { style: 'double', color: { argb: 'FF475569' } }
      };
      
      if (colIdx === 1) cell.alignment = { horizontal: 'left', vertical: 'middle' };
      if (colIdx === 3) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '0.00" km"';
      }
      if (colIdx === 4) cell.alignment = { horizontal: 'right', vertical: 'middle' };
      if (colIdx === 5) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    });
  }


  // --- SHEET 2: BESTENLISTE ---
  const ws2 = workbook.addWorksheet('Bestenliste', {
    views: [{ showGridLines: true, state: 'frozen', ySplit: 3 }]
  });

  // 1. Title Banner
  ws2.mergeCells('A1:E1');
  const titleCell2 = ws2.getCell('A1');
  titleCell2.value = 'Laufgruppe - Bestenliste';
  titleCell2.font = { name: fontName, size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell2.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF06B6D4' } // Cyan-500 for a fresh leaderboard accent
  };
  titleCell2.alignment = { vertical: 'middle', horizontal: 'center' };
  ws2.getRow(1).height = 45;

  // Row 2 spacing
  ws2.getRow(2).height = 15;

  // 2. Table Headers
  const headers2 = ['Rang', 'Läufer', 'Läufe', 'Gesamtdistanz', 'Ø Pace'];
  ws2.getRow(3).values = headers2;
  ws2.getRow(3).height = 28;

  ws2.getRow(3).eachCell((cell) => {
    cell.font = { name: fontName, size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF0891B2' } // Cyan-600
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      bottom: { style: 'medium', color: { argb: 'FF0E7490' } }
    };
  });

  // Sort Leaderboard
  const sortedStats = [...stats].sort((a, b) => b.totalDistance - a.totalDistance);

  // 3. Add Leaderboard Rows
  sortedStats.forEach((runner, idx) => {
    const rowNum = idx + 4;
    const row = ws2.getRow(rowNum);
    
    row.values = [
      idx + 1,
      runner.runnerName,
      runner.totalRuns,
      runner.totalDistance,
      runner.averagePace + ' min/km'
    ];
    row.height = 26; // More generous spacing for leaderboard

    // Alignments
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }; // Rank
    row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };   // Name
    row.getCell(2).font = { name: fontName, bold: true, size: 11 };
    row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }; // Runs
    row.getCell(4).alignment = { horizontal: 'right', vertical: 'middle' };  // Total Distance
    row.getCell(4).numFmt = '0.00" km"';
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };  // Avg Pace

    // Highlight top 3 ranks
    const rank = idx + 1;
    let rankColor = 'FFFFFFFF'; // Default White
    let rankText = 'FF475569';
    let isPodium = false;

    if (rank === 1) {
      rankColor = 'FEF3C7'; // Gold
      rankText = 'B45309';  // Dark amber
      isPodium = true;
    } else if (rank === 2) {
      rankColor = 'F1F5F9'; // Silver
      rankText = '475569';  // Slate-600
      isPodium = true;
    } else if (rank === 3) {
      rankColor = 'FFEDD5'; // Bronze
      rankText = 'C2410C';  // Orange-700
      isPodium = true;
    }

    row.eachCell((cell, colIdx) => {
      cell.font = { 
        name: fontName, 
        size: 10, 
        bold: colIdx === 2 || colIdx === 4 || (colIdx === 1 && isPodium),
        color: colIdx === 1 && isPodium ? { argb: 'FF' + rankText } : { argb: 'FF0F172A' }
      };
      
      // Apply gold/silver/bronze fill to Rank cell specifically
      if (colIdx === 1 && isPodium) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF' + rankColor }
        };
      } else {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8FAFC' }
        };
      }

      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } }
      };
    });
  });


  // --- AUTO-FIT COLUMN WIDTHS FOR BOTH SHEETS ---
  [ws1, ws2].forEach((ws) => {
    ws.columns.forEach((column) => {
      let maxLen = 0;
      column.eachCell!({ includeEmpty: true }, (cell, rowNumber) => {
        // Skip title row (row 1) for width calculations
        if (rowNumber === 1) return;
        
        let cellVal = cell.value;
        if (cellVal && typeof cellVal === 'object' && 'formula' in cellVal) {
          cellVal = '000.00 km'; // estimate width for formula results
        }
        
        const len = cellVal ? cellVal.toString().length : 0;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(Math.max(maxLen + 4, 12), 35);
    });
  });


  // --- TRIGGER BROWSER DOWNLOAD ---
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Laufgruppe_Protokoll_${dateToday}.xlsx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

-- VeroCRM — dati demo (opzionale). Applica con:
--   wrangler d1 execute verocrm-db --file migrations/0002_seed.sql
-- Già caricati sul database verocrm-db in fase di provisioning.

INSERT INTO aziende (nome,tipo,citta,provincia) VALUES
('Sport Center Bari','cliente','Bari','BA'),
('Comune di Lecce','pa','Lecce','LE'),
('Hotel Riviera','prospect','Otranto','LE'),
('Centro Le Vele','cliente','Bari','BA'),
('Pro Loco Otranto','cliente','Otranto','LE'),
('Farmacia San Marco','prospect','Lecce','LE'),
('Studio Dentistico','prospect','Brindisi','BR');

INSERT INTO contatti (azienda_id,nome,ruolo,email,telefono,stato,priorita) VALUES
(1,'Mario Rossi','Direttore','m.rossi@sportcenter.it','+39 080 123 4567','lead',3),
(3,'Lucia Bianchi','Titolare','info@hotelriviera.it',NULL,'lead',2),
(2,'Giuseppe Verdi','Resp. acquisti','g.verdi@comune.lecce.it',NULL,'active',3),
(4,'Anna Esposito','Marketing','a.esposito@levele.it',NULL,'active',2),
(6,'Marco Greco','Farmacista','farmacia@sanmarco.it',NULL,'lead',1),
(5,'Sara Conti','Event manager','eventi@prolocotranto.it',NULL,'active',3),
(7,'Davide Russo','Titolare','studio@dentista.it',NULL,'cold',1);

INSERT INTO trattative (azienda_id,contatto_id,titolo,fase,valore,probabilita,owner) VALUES
(3,2,'Totem ingresso','lead',6200,20,'AB'),
(6,5,'Insegna LED','lead',3400,15,'GV'),
(4,4,'Schermo vetrina','qualificato',9800,40,'AB'),
(7,7,'LED indoor P2.5','qualificato',4100,30,'GV'),
(1,1,'LED wall esterno P4 6x3','proposta',18500,60,'AB'),
(5,6,'Maxischermo eventi','negoziazione',22000,75,'GV'),
(2,3,'LED piazza','vinta',14000,100,'AB');

INSERT INTO preventivi (numero,azienda_id,contatto_id,trattativa_id,stato,imponibile,iva_perc,totale,data) VALUES
('2026-014',1,1,5,'sent',18500,22,22570,'2026-06-04'),
('2026-013',4,4,3,'won',9800,22,11956,'2026-05-28'),
('2026-012',3,2,1,'draft',6200,22,7564,'2026-06-02'),
('2026-011',5,6,6,'sent',22000,22,26840,'2026-05-20');

INSERT INTO preventivo_righe (preventivo_id,descrizione,quantita,prezzo,totale) VALUES
(1,'Modulo LED esterno P4 6x3 m (18 mq)',18,780,14040),
(1,'Sistema controllo NovaStar TB60',1,1200,1200),
(1,'Struttura + installazione',1,2800,2800),
(1,'Contratto gestione contenuti (12 mesi)',1,460,460);

INSERT INTO attivita (tipo,titolo,azienda_id,contatto_id,trattativa_id,scadenza,completata) VALUES
('call','Richiamare Sport Center Bari',1,1,5,'2026-06-04 14:30',0),
('email','Inviare preventivo Hotel Riviera',3,2,1,'2026-06-04 16:00',0),
('ticket','Assistenza schermo offline Hotel Riviera',3,2,NULL,'2026-06-04 09:00',0),
('meeting','Sopralluogo Comune di Lecce',2,3,7,'2026-06-03 11:00',1),
('meeting','Demo prodotto Centro Le Vele',4,4,3,'2026-06-11 10:00',0),
('task','Firma contratto Farmacia San Marco',6,5,2,'2026-06-12 15:00',0);

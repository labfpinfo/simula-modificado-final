drop database if exists PokemonDB;
CREATE DATABASE PokemonDB;
USE PokemonDB;

-- Tabla de Ligas
CREATE TABLE ligas (
    idliga INT PRIMARY KEY,
    nombre VARCHAR(50),
    ganador VARCHAR(50),
    lideres VARCHAR(50)
);

-- Tabla de Entrenadores
CREATE TABLE entrenadores (
    identrenador INT PRIMARY KEY,
    nombre VARCHAR(50),
    apellidos VARCHAR(50),
    edad INT,
    idliga INT,
    nivel INT,
    region VARCHAR(50),
	FOREIGN KEY (idliga) REFERENCES ligas(idliga)
);

-- Tabla de Pokémon
CREATE TABLE pokemon (
    idpokemon INT PRIMARY KEY,
    nombre VARCHAR(50),
    nombre_entrenador VARCHAR(50),
    descripcion VARCHAR(50),
    identrenador INT,
    nivel INT,
    sexo CHAR(1),
    salud INT,
    FOREIGN KEY (identrenador) REFERENCES entrenadores(identrenador)
);

-- Tabla de Tipos de Pokémon
CREATE TABLE tipo (
    idtipo INT PRIMARY KEY,
    nombre VARCHAR(50),
    fuerte_contra VARCHAR(50),
    debil_contra VARCHAR(50),
    idpokemon INT,
    descripcion VARCHAR(100),
    FOREIGN KEY (idpokemon) REFERENCES pokemon(idpokemon)
);




-- Tabla de Ciudades
CREATE TABLE ciudades (
    idciudad INT PRIMARY KEY,
    nombre VARCHAR(50),
    descripcion VARCHAR(150)
);

-- Tabla de Gimnasios
CREATE TABLE gimnasios (
    idgimnasio INT PRIMARY KEY,
    tipo VARCHAR(50),
    lider VARCHAR(50),
    nombre VARCHAR(50),
    idciudad INT,
    FOREIGN KEY (idciudad) REFERENCES ciudades(idciudad)
);

-- Tabla de Combates
CREATE TABLE combaten (
    idgimnasio INT,
    identrenador INT,
    resultado VARCHAR(50),
    PRIMARY KEY (idgimnasio, identrenador),
    FOREIGN KEY (idgimnasio) REFERENCES gimnasios(idgimnasio),
    FOREIGN KEY (identrenador) REFERENCES entrenadores(identrenador)
);

-- Tabla de Tiendas
CREATE TABLE tiendas (
    idtienda INT PRIMARY KEY,
    nombre_tienda VARCHAR(50),
    tipo_tienda VARCHAR(50),
    objetos_de_curaciones TINYINT(1),
    objetos_de_ayuda TINYINT(1),
    idciudad INT,
    FOREIGN KEY (idciudad) REFERENCES ciudades(idciudad)
);

-- Tabla de Asistencia
CREATE TABLE asistencia (
    idcentropokemon INT,
    nombre_centro VARCHAR(50),
    area_de_intercambio VARCHAR(50),
    fecha_asistencia DATE,
    PRIMARY KEY (idcentropokemon)
);

-- Tabla de Relación "Pueden Tener" (Relaciona Pokémon con sus tipos)
CREATE TABLE pokemonasistencia(
    idpokemon INT,
    idcentropokemon INT,
    PRIMARY KEY (idpokemon, idcentropokemon),
    FOREIGN KEY (idpokemon) REFERENCES pokemon(idpokemon),
    FOREIGN KEY (idcentropokemon) REFERENCES asistencia(idcentropokemon)
);

-- Tabla "Van A" (Relación entre Entrenadores y Ciudades)
CREATE TABLE entrenadoresciudades (
    idciudad INT,
    identrenador INT,
    PRIMARY KEY (idciudad, identrenador),
    FOREIGN KEY (idciudad) REFERENCES ciudades(idciudad),
    FOREIGN KEY (identrenador) REFERENCES entrenadores(identrenador)
);

-- Poblar la base de datos con datos de ejemplo

INSERT INTO ligas VALUES
(1, 'Liga Kanto', 'Ash', 'Brock, Misty, Gary'),
(2, 'Liga Johto', 'Ethan', 'Falkner, Whitney, Clair'),
(3, 'Liga Hoenn', 'Brendan', 'Roxanne, Brawly, Wallace'),
(4, 'Liga Sinnoh', 'Lucas', 'Roark, Fantina, Volkner'),
(5, 'Liga Unova', 'Hilbert', 'Cheren, Iris, Drayden'),
(6, 'Liga Alola', 'Ash', 'Kukui, Guzma, Hau'),
(7, 'Liga Galar', 'Leon', 'Bea, Raihan, Piers'),
(8, 'Liga Kalos', 'Alain', 'Diantha, Siebold, Malva'),
(9, 'Liga Teselia', 'Iris', 'Drayden, Cheren, Marlon'),
(10, 'Liga Sinnoh', 'Cynthia', 'Bertha, Aaron, Flint'),
(11, 'Liga Orange', 'Drake', 'Cissy, Danny, Rudy'),
(12, 'Liga Teselia', 'Iris', 'Cheren, Drayden, Marlon'),
(13, 'Liga Kalos', 'Alain', 'Diantha, Siebold, Malva'),
(14, 'Liga Alola', 'Ash', 'Kukui, Guzma, Hau'),
(15, 'Liga Paldea', 'Geeta', 'Rika, Poppy, Larry');

INSERT INTO entrenadores VALUES
(1, 'Ash', 'Ketchum', 10, 1, 50, 'Kanto'),
(2, 'Misty', 'Williams', 12, 2, 45, 'Kanto'),
(3, 'Brock', 'Stone', 15, 3, 48, 'Kanto'),
(4, 'Gary', 'Oak', 11, 1, 52, 'Kanto'),
(5, 'Serena', 'Yvonne', 13, 4, 49, 'Kalos'),
(6, 'May', 'Maple', 12, 3, 46, 'Hoenn'),
(7, 'Dawn', 'Berlitz', 11, 4, 44, 'Sinnoh'),
(8, 'Iris', 'Dragon', 14, 5, 51, 'Unova'),
(9, 'Cynthia', 'Champion', 27, 4, 100, 'Sinnoh'),
(10, 'Leon', 'Invincible', 28, 6, 99, 'Galar'),
(11, 'Red', 'Trainer', 18, 11, 99, 'Kanto'),
(12, 'Blue', 'Oak', 18, 11, 98, 'Kanto'),
(13, 'Ethan', 'Gold', 17, 12, 95, 'Johto'),
(14, 'Brendan', 'Emerald', 16, 13, 92, 'Hoenn'),
(15, 'Lucas', 'Diamond', 15, 14, 90, 'Sinnoh');

INSERT INTO pokemon VALUES
(1, 'Pikachu', 'Ash', 'Eléctrico', 1, 25, 'M', 100),
(2, 'Charizard', 'Ash', 'Fuego/Volador', 1, 50, 'M', 120),
(3, 'Squirtle', 'Misty', 'Agua', 2, 20, 'M', 95),
(4, 'Onix', 'Brock', 'Roca/Tierra', 3, 30, 'M', 110),
(5, 'Eevee', 'Gary', 'Normal', 4, 18, 'F', 90),
(6, 'Torchic', 'May', 'Fuego', 6, 16, 'M', 85),
(7, 'Piplup', 'Dawn', 'Agua', 7, 18, 'M', 90),
(8, 'Axew', 'Iris', 'Dragón', 8, 15, 'M', 80),
(9, 'Garchomp', 'Cynthia', 'Dragón/Tierra', 9, 78, 'F', 200),
(10, 'Charizard', 'Leon', 'Fuego/Volador', 10, 70, 'M', 190),
(11, 'Snorlax', 'Red', 'Normal', 11, 70, 'M', 160),
(12, 'Gengar', 'Blue', 'Fantasma/Veneno', 12, 65, 'M', 140),
(13, 'Feraligatr', 'Ethan', 'Agua', 13, 68, 'M', 155),
(14, 'Sceptile', 'Brendan', 'Planta', 14, 67, 'M', 150),
(15, 'Infernape', 'Lucas', 'Fuego/Lucha', 15, 66, 'M', 145);

INSERT INTO tipo VALUES
(1, 'Eléctrico', 'Agua', 'Tierra', 1, 'Ataques eléctricos potentes'),
(2, 'Fuego', 'Planta', 'Agua', 2, 'Ataques basados en fuego'),
(3, 'Agua', 'Fuego', 'Eléctrico', 3, 'Ataques de agua'),
(4, 'Roca', 'Fuego', 'Agua', 4, 'Ataques duros y resistentes'),
(5, 'Normal', 'Ninguno', 'Lucha', 5, 'Ataques estándar sin afinidad elemental'),
(6, 'Fantasma', 'Psíquico', 'Siniestro', NULL, 'Ataques espectrales y evasivos'),
(7, 'Hada', 'Dragón', 'Acero', NULL, 'Ataques mágicos y encantamientos'),
(8, 'Siniestro', 'Fantasma', 'Lucha', NULL, 'Ataques estratégicos y astucia'),
(9, 'Acero', 'Hada', 'Fuego', NULL, 'Ataques duros y resistentes'),
(10, 'Bicho', 'Psíquico', 'Fuego', NULL, 'Ataques rápidos y persistentes'),
(11, 'Fantasma', 'Psíquico', 'Siniestro', 12, 'Ataques espectrales y evasivos'),
(12, 'Veneno', 'Hada', 'Tierra', 12, 'Ataques tóxicos y venenosos'),
(13, 'Hielo', 'Dragón', 'Fuego', NULL, 'Ataques congelantes y resistentes'),
(14, 'Lucha', 'Siniestro', 'Volador', NULL, 'Ataques físicos poderosos'),
(15, 'Dragón', 'Fuego', 'Hada', 13, 'Ataques místicos de gran poder');


INSERT INTO ciudades VALUES
(1, 'Pewter', 'Ciudad rocosa y hogar del Gimnasio Roca'),
(2, 'Cerulean', 'Ciudad del agua y hogar de Misty'),
(3, 'Vermilion', 'Ciudad portuaria con el S.S. Anne'),
(4, 'Saffron', 'Ciudad metropolitana y centro psíquico'),
(5, 'Cinnabar', 'Isla volcánica con un gimnasio de fuego'),
(6, 'Mahogany', 'Ciudad nevada con un gimnasio de hielo'),
(7, 'Virbank', 'Ciudad industrial con un gimnasio de veneno'),
(8, 'Opelucid', 'Ciudad con un gimnasio de dragón'),
(9, 'Veilstone', 'Ciudad con el casino y un gimnasio de lucha'),
(10, 'Olivine', 'Ciudad portuaria con un gimnasio de acero'),
(11, 'Goldenrod', 'Ciudad comercial con el mayor centro Pokémon'),
(12, 'Lilycove', 'Ciudad con grandes tiendas y un puerto'),
(13, 'Jubilife', 'Ciudad tecnológica con la TV Jubilife'),
(14, 'Castelia', 'Ciudad metropolitana con rascacielos'),
(15, 'Lumiose', 'Ciudad moderna con la Torre Prisma');



INSERT INTO gimnasios VALUES
(1, 'Roca', 'Brock', 'Pewter', 1),
(2, 'Agua', 'Misty', 'Cerulean', 2),
(3, 'Electricidad', 'Lt. Surge', 'Vermilion', 3),
(4, 'Psíquico', 'Sabrina', 'Saffron', 4),
(5, 'Fuego', 'Blaine', 'Cinnabar', 5),
(6, 'Hielo', 'Pryce', 'Mahogany', 6),
(7, 'Veneno', 'Roxie', 'Virbank', 7),
(8, 'Dragón', 'Drayden', 'Opelucid', 8),
(9, 'Lucha', 'Maylene', 'Veilstone', 9),
(10, 'Acero', 'Jasmine', 'Olivine', 10),
(11, 'Normal', 'Whitney', 'Goldenrod', 11),
(12, 'Agua', 'Juan', 'Lilycove', 12),
(13, 'Acero', 'Byron', 'Jubilife', 13),
(14, 'Bicho', 'Burgh', 'Castelia', 14),
(15, 'Eléctrico', 'Clemont', 'Lumiose', 15);

-- Insertar registros en la tabla Combaten 
INSERT INTO combaten VALUES
(1, 3, 'Victoria'),
(2, 5, 'Derrota'),
(3, 1, 'Victoria'),
(4, 2, 'Derrota'),
(5, 4, 'Victoria'),
(6, 6, 'Victoria'),
(7, 8, 'Derrota'),
(8, 9, 'Victoria'),
(9, 7, 'Victoria'),
(10, 10, 'Derrota'),
(11, 12, 'Victoria'),
(12, 11, 'Derrota'),
(13, 14, 'Victoria'),
(14, 13, 'Derrota'),
(15, 15, 'Victoria');


INSERT INTO tiendas VALUES
(1, 'PokeMart Pewter', 'Objetos generales', 1, 1, 1),
(2, 'PokeMart Cerulean', 'Curaciones', 1, 1, 2),
(3, 'PokeMart Vermilion', 'Equipamiento', 1, 0, 3),
(4, 'PokeMart Saffron', 'Objetos raros', 0, 1, 4),
(5, 'PokeMart Cinnabar', 'Objetos de fuego', 1, 1, 5),
(6, 'PokeMart Mahogany', 'Objetos de hielo', 1, 1, 6),
(7, 'PokeMart Virbank', 'Antídotos y curas', 1, 1, 7),
(8, 'PokeMart Opelucid', 'Objetos de dragón', 1, 1, 8),
(9, 'PokeMart Veilstone', 'Equipamiento de lucha', 1, 0, 9),
(10, 'PokeMart Olivine', 'Objetos de acero', 1, 1, 10),
(11, 'PokeMart Goldenrod', 'Mega Tienda', 1, 1, 11),
(12, 'PokeMart Lilycove', 'Artículos Raros', 0, 1, 12),
(13, 'PokeMart Jubilife', 'Equipamiento Tecnológico', 1, 0, 13),
(14, 'PokeMart Castelia', 'Medicina Especial', 1, 1, 14),
(15, 'PokeMart Lumiose', 'Tienda Premium', 1, 1, 15);


INSERT INTO asistencia VALUES
(1, 'Centro Pokémon Pewter', 'Intercambio', '2020-02-12'),
(2, 'Centro Pokémon Cerulean', 'Sanación', '2025-02-13'),
(3, 'Centro Pokémon Vermilion', 'Eventos', '2023-02-14'),
(4, 'Centro Pokémon Saffron', 'Investigación', '2021-02-15'),
(5, 'Centro Pokémon Cinnabar', 'Entrenamiento', '2025-02-16'),
(6, 'Centro Pokémon Mahogany', 'Sanación', '2022-02-17'),
(7, 'Centro Pokémon Virbank', 'Intercambio', '2022-02-18'),
(8, 'Centro Pokémon Opelucid', 'Investigación', '2025-02-19'),
(9, 'Centro Pokémon Veilstone', 'Entrenamiento', '2025-02-20'),
(10, 'Centro Pokémon Olivine', 'Eventos', '2024-02-21'),
(11, 'Centro Pokémon Goldenrod', 'Tratamiento Especial', '2025-03-01'),
(12, 'Centro Pokémon Lilycove', 'Investigación', '2025-03-02'),
(13, 'Centro Pokémon Jubilife', 'Eventos', '2023-03-03'),
(14, 'Centro Pokémon Castelia', 'Terapia de Batalla', '2025-03-04'),
(15, 'Centro Pokémon Lumiose', 'Entrenamiento', '2025-03-05');


-- Insertar registros variados en la tabla PokemonAsistencia
INSERT INTO pokemonasistencia VALUES
(1, 3),  -- Pikachu asistió al centro 3
(2, 5),  -- 
(3, 3),  -- 
(1, 2),  -- 
(5, 3),  -- 
(6, 5),  -- 
(7, 8),  -- 
(8, 9),  -- 
(10, 7),  -- 
(10, 14), -- 
(11, 12), -- 
(12, 11), -- 
(13, 14), -- 
(14, 13), -- 
(14, 15); -- 


-- Insertar registros variados en la tabla EntrenadoresCiudades
INSERT INTO entrenadoresciudades VALUES
(1, 1),  -- Brock ha visitado Pewter
(2, 2),  -- Serena ha visitado Cerulean
(3, 1),  -- Ash ha visitado Vermilion
(4, 2),  -- Misty ha visitado Saffron
(5, 4),  -- Gary ha visitado Cinnabar
(6, 6),  -- May ha visitado Mahogany
(7, 8),  -- Dawn ha visitado Opelucid
(8, 9),  -- Iris ha visitado Veilstone
(9, 7),  -- Cynthia ha visitado Virbank
(10, 10), -- Leon ha visitado Olivine
(11, 12), -- Red ha visitado Lilycove
(12, 11), -- Blue ha visitado Goldenrod
(13, 14), -- Ethan ha visitado Castelia
(14, 13), -- Brendan ha visitado Jubilife
(15, 15); -- Lucas ha visitado Lumiose

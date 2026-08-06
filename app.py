import streamlit as st
import pandas as pd
import os
from datetime import datetime

# Configuración de página
st.set_page_config(page_title="Trivia de Oficina", page_icon="🏆", layout="wide")

DATA_FILE = "puntajes_trivia.csv"

# Cargar o crear dataset
if os.path.exists(DATA_FILE):
    df_scores = pd.read_csv(DATA_FILE)
else:
    df_scores = pd.DataFrame(columns=["Fecha", "Día", "Jugador", "Puntos"])

st.title("🏆 Campeonato de Trivia")
st.caption("Registro de puntos para Lunes, Martes y Jueves")

# Sidebar - Registro de Puntajes
st.sidebar.header("📝 Registrar Puntaje")
fecha = st.sidebar.date_input("Fecha", datetime.now())
dia_nombre = fecha.strftime("%A")

# Traducir día a español
dias_esp = {"Monday": "Lunes", "Tuesday": "Martes", "Thursday": "Jueves"}
dia_str = dias_esp.get(dia_nombre, dia_nombre)

if dia_nombre not in ["Monday", "Tuesday", "Thursday"]:
    st.sidebar.warning("⚠️ Recuerden que la trivia se juega solo Lunes, Martes y Jueves.")

jugador = st.sidebar.text_input("Nombre del Compañero/a")
puntos = st.sidebar.number_input("Puntos Obtenidos", min_value=0, max_value=100, step=1)

if st.sidebar.button("Guardar Puntaje"):
    if jugador.strip():
        nuevo_registro = pd.DataFrame([{
            "Fecha": fecha.strftime("%Y-%m-%d"),
            "Día": dia_str,
            "Jugador": jugador.strip().capitalize(),
            "Puntos": puntos
        }])
        df_scores = pd.concat([df_scores, nuevo_registro], ignore_index=True)
        df_scores.to_csv(DATA_FILE, index=False)
        st.sidebar.success(f"¡Puntos guardados para {jugador}!")
        st.rerun()
    else:
        st.sidebar.error("Ingresá el nombre del jugador.")

# Cuerpo principal
col1, col2 = st.columns([2, 1])

with col1:
    st.subheader("🥇 Tabla de Posiciones General")
    if not df_scores.empty:
        # Métricas agrupadas
        leaderboard = df_scores.groupby("Jugador").agg(
            Puntos_Totales=("Puntos", "sum"),
            Trivias_Jugadas=("Puntos", "count"),
            Promedio=("Puntos", "mean")
        ).reset_index()

        leaderboard["Promedio"] = leaderboard["Promedio"].round(2)
        leaderboard = leaderboard.sort_values(by=["Puntos_Totales", "Promedio"], ascending=False)
        leaderboard.index = range(1, len(leaderboard) + 1)
        
        st.dataframe(leaderboard, use_container_width=True)
    else:
        st.info("Todavía no hay puntajes registrados.")

with col2:
    st.subheader("📋 Historial de Cargas")
    if not df_scores.empty:
        st.dataframe(df_scores.sort_index(ascending=False), height=300, use_container_width=True)
        if st.button("Borrar Último Registro"):
            df_scores = df_scores.iloc[:-1]
            df_scores.to_csv(DATA_FILE, index=False)
            st.rerun()